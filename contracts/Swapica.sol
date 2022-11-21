pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Signers.sol";

contract Swapica is UUPSUpgradeable, Signers {
    event OrderUpdated(uint indexed id, Status indexed status);
    event MatchUpdated(uint indexed id, Status indexed status);

    struct Order {
        uint256 id;
        address account;
        address tokenToSell; // origin chain
        address tokenToBuy; // destination chain
        uint256 amountToSell;
        uint256 amountToBuy;
        uint destChain;
    }

    struct Match {
        uint256 id;
        uint256 originOrderId;
        address account;
        address tokenToSell; // destination chain
        uint256 amountToSell; // destination chain
        uint originChain;
    }

    enum Status {
        NONE,
        AWAITING_MATCH,
        AWAITING_FINALIZATION,
        CANCELED,
        EXECUTED
    }

    address public validator;
    Order[] public orders;
    Match[] public matches;
    mapping(uint => Status) public orderStatus;
    mapping(uint => Status) public matchStatus;
    mapping(address => mapping(address => uint)) public locked;

    modifier checkSignature(bytes calldata orderData, bytes[] calldata signatures) {
        _checkSignatures(orderData, signatures);
        _;
    }

    function __Swapica_init(address[] calldata signers) external initializer {
        __Signers_init(signers, signers.length);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// ORDER part

    function createOrder(
        address tokenToSell,
        uint amountToSell,
        address tokenToBuy,
        uint amountToBuy,
        uint destChain
    ) external {
        uint id = orders.length;
        lock(tokenToSell, msg.sender, amountToSell);
        orderStatus[id] = Status.AWAITING_MATCH;
        emit OrderUpdated(id, orderStatus[id]);
        orders.push(
            Order(id, msg.sender, tokenToSell, tokenToBuy, amountToSell, amountToBuy, destChain)
        );
    }

    function cancelOrder(uint id) external {
        Order storage order = orders[id];
        require(orderStatus[id] == Status.AWAITING_MATCH, "Order's status is wrong");
        require(order.account == msg.sender);
        orderStatus[id] = Status.CANCELED;
        emit OrderUpdated(id, orderStatus[id]);
        release(order.tokenToSell, order.account, order.account, order.amountToSell);
    }

    function executeOrder(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external checkSignature(orderData, signatures) {
        (bytes4 selector, uint chainid, uint id, address receiver) = abi.decode(
            orderData,
            (bytes4, uint, uint, address)
        );
        require(selector == this.executeOrder.selector, "Wrong Selector");
        _checkChainid(chainid);
        require(orderStatus[id] == Status.AWAITING_MATCH);

        Order storage order = orders[id];
        orderStatus[id] = Status.EXECUTED;
        emit OrderUpdated(id, orderStatus[id]);
        release(order.tokenToSell, order.account, receiver, order.amountToSell);
    }

    /// MATCH PART

    function createMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external checkSignature(orderData, signatures) {
        (
            bytes4 selector,
            uint chainid,
            uint orderId,
            address tokenToSell,
            uint amountToSell,
            uint originChain
        ) = abi.decode(orderData, (bytes4, uint, uint, address, uint, uint));
        require(selector == this.createMatch.selector, "Wrong Selector");
        _checkChainid(chainid);

        lock(tokenToSell, msg.sender, amountToSell);
        uint id = matches.length;
        matches.push(Match(id, orderId, msg.sender, tokenToSell, amountToSell, originChain));
        matchStatus[id] = Status.AWAITING_FINALIZATION;
        emit MatchUpdated(id, matchStatus[id]);
    }

    function cancelMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external checkSignature(orderData, signatures) {
        (bytes4 selector, uint chainid, uint id) = abi.decode(orderData, (bytes4, uint, uint));
        require(selector == this.cancelMatch.selector, "Wrong Selector");
        _checkChainid(chainid);
        require(matchStatus[id] == Status.AWAITING_FINALIZATION, "Order's status is wrong");

        Match storage order = matches[id];
        matchStatus[id] = Status.CANCELED;
        emit MatchUpdated(id, matchStatus[id]);
        release(order.tokenToSell, order.account, order.account, order.amountToSell);
    }

    function finializeMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external checkSignature(orderData, signatures) {
        (bytes4 selector, uint chainid, uint id, address receiver) = abi.decode(
            orderData,
            (bytes4, uint, uint, address)
        );
        require(selector == this.finializeMatch.selector, "Wrong Selector");
        _checkChainid(chainid);
        require(matchStatus[id] == Status.AWAITING_FINALIZATION, "Order's status is wrong");

        Match storage order = matches[id];
        matchStatus[id] = Status.EXECUTED;
        emit MatchUpdated(id, matchStatus[id]);
        release(order.tokenToSell, order.account, receiver, order.amountToSell);
    }

    /// FUNDS MANIPULATING

    function lock(address coin, address account, uint amount) internal {
        locked[account][coin] += amount;
        SafeERC20.safeTransferFrom(IERC20(coin), account, address(this), amount);
    }

    function release(address coin, address account, address to, uint amount) internal {
        locked[account][coin] -= amount;
        SafeERC20.safeTransfer(IERC20(coin), to, amount);
    }

    function _checkChainid(uint256 chainid) internal {
        require(block.chainid == chainid, "ChainId Error");
    }
}
