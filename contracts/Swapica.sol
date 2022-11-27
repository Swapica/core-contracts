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
    enum Selector {
        EXECUTE_ORDER,
        EXECUTE_MATCH,
        CREATE_MATCH,
        CANCEL_MATCH
    }

    struct Status {
        State state;
        uint256 executedBy;
    }
    enum State {
        NONE,
        AWAITING_MATCH,
        AWAITING_FINALIZATION,
        CANCELED,
        EXECUTED
    }

    Order[] public orders;
    Match[] public matches;
    mapping(uint => Status) public orderStatus;
    mapping(uint => Status) public matchStatus;
    mapping(address => mapping(address => uint)) public locked;

    modifier checkSignature(bytes calldata orderData, bytes[] calldata signatures) {
        _checkSignatures(keccak256(orderData), signatures);
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
        orderStatus[id].state = State.AWAITING_MATCH;
        emit OrderUpdated(id, orderStatus[id]);
        orders.push(
            Order(id, msg.sender, tokenToSell, tokenToBuy, amountToSell, amountToBuy, destChain)
        );
    }

    function cancelOrder(uint id) external {
        Order storage order = orders[id];
        require(orderStatus[id].state == State.AWAITING_MATCH, "Order's status is wrong");
        require(order.account == msg.sender);
        orderStatus[id].state = State.CANCELED;
        emit OrderUpdated(id, orderStatus[id]);
        release(order.tokenToSell, order.account, order.account, order.amountToSell);
    }

    function executeOrder(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external checkSignature(orderData, signatures) {
        (
            Selector selector,
            uint chainid,
            address swapica,
            uint id,
            address receiver,
            uint matchid
        ) = abi.decode(orderData, (Selector, uint, address, uint, address, uint));
        require(selector == Selector.EXECUTE_ORDER, "Wrong Selector");
        require(orderStatus[id].state == State.AWAITING_MATCH);
        _checkSignatureRecipient(chainid, swapica);

        Order storage order = orders[id];
        orderStatus[id].state = State.EXECUTED;
        orderStatus[id].executedBy = matchid;
        // orderStatus[id] = Status(State.EXECUTED, matchid);
        emit OrderUpdated(id, orderStatus[id]);
        release(order.tokenToSell, order.account, receiver, order.amountToSell);
    }

    /// MATCH PART

    function createMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external checkSignature(orderData, signatures) {
        (
            Selector selector,
            uint chainid,
            address swapica,
            uint orderId,
            address tokenToSell,
            uint amountToSell,
            uint originChain
        ) = abi.decode(orderData, (Selector, uint, address, uint, address, uint, uint));
        require(selector == Selector.CREATE_MATCH, "Wrong Selector");
        _checkSignatureRecipient(chainid, swapica);

        lock(tokenToSell, msg.sender, amountToSell);
        uint id = matches.length;
        matches.push(Match(id, orderId, msg.sender, tokenToSell, amountToSell, originChain));
        matchStatus[id].state = State.AWAITING_FINALIZATION;
        emit MatchUpdated(id, matchStatus[id]);
    }

    function cancelMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external checkSignature(orderData, signatures) {
        (Selector selector, uint chainid, address swapica, uint id) = abi.decode(
            orderData,
            (Selector, uint, address, uint)
        );
        require(selector == Selector.CANCEL_MATCH, "Wrong Selector");
        _checkSignatureRecipient(chainid, swapica);
        require(matchStatus[id].state == State.AWAITING_FINALIZATION, "Order's status is wrong");

        Match storage order = matches[id];
        require(order.account == msg.sender);
        matchStatus[id].state = State.CANCELED;
        emit MatchUpdated(id, matchStatus[id]);
        release(order.tokenToSell, order.account, order.account, order.amountToSell);
    }

    function executeMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external checkSignature(orderData, signatures) {
        (Selector selector, uint chainid, address swapica, uint id, address receiver) = abi.decode(
            orderData,
            (Selector, uint, address, uint, address)
        );
        _checkSignatureRecipient(chainid, swapica);
        require(selector == Selector.EXECUTE_MATCH, "Wrong Selector");
        require(matchStatus[id].state == State.AWAITING_FINALIZATION, "Order's status is wrong");

        Match storage order = matches[id];
        matchStatus[id].state = State.EXECUTED;
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

    function _checkSignatureRecipient(uint256 chainid, address swapica) internal {
        require(block.chainid == chainid && address(this) == swapica, "Wrong Signature Recipient");
    }
}
