pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract Swapica is UUPSUpgradeable, OwnableUpgradeable {
    using ECDSA for bytes32;
    using ECDSA for bytes;

    event OrderCreated(uint indexed id);

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
        CANCALLED,
        EXECUTED
    }

    address validator;
    Order[] public orders;
    Match[] public matches;
    mapping(uint => Status) public orderStatus;
    mapping(uint => Status) public matchStatus;
    mapping(address => mapping(address => uint)) public locked;

    modifier checkSignature(bytes memory orderData, bytes memory signature) {
        _checkSignature(orderData, signature);
        _;
    }

    function __Swapica_init() external initializer {
        __Ownable_init();
        validator = msg.sender;
    }

    function setValidator(address _v) external onlyOwner {
        validator = _v;
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
        emit OrderCreated(orders.length);
        lock(tokenToSell, msg.sender, amountToSell);
        orderStatus[orders.length] = Status.AWAITING_MATCH;
        orders.push(
            Order(
                orders.length,
                msg.sender,
                tokenToSell,
                tokenToBuy,
                amountToSell,
                amountToBuy,
                destChain
            )
        );
    }

    function cancelOrder(uint id) external {
        Order storage order = orders[id];
        require(orderStatus[id] == Status.AWAITING_MATCH, "Order's status is wrong");
        orderStatus[id] = Status.CANCALLED;
        release(order.tokenToSell, order.account, order.account, order.amountToSell);
    }

    function executeOrder(
        bytes memory orderData,
        bytes memory signature
    ) external checkSignature(orderData, signature) {
        (bytes4 selector, uint chainid, uint id, address reciever) = abi.decode(
            orderData,
            (bytes4, uint, uint, address)
        );
        require(selector == this.executeOrder.selector, "Wrong Selector");
        _checkChainid(chainid);
        require(orderStatus[id] == Status.AWAITING_MATCH);

        Order storage order = orders[id];
        orderStatus[id] = Status.EXECUTED;
        release(order.tokenToSell, order.account, reciever, order.amountToSell);
    }

    /// MATCH PART

    function createMatch(
        bytes memory orderData,
        bytes memory signature
    ) external checkSignature(orderData, signature) {
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

        matchStatus[matches.length] = Status.AWAITING_FINALIZATION;
        matches.push(
            Match(matches.length, orderId, msg.sender, tokenToSell, amountToSell, originChain)
        );
        lock(tokenToSell, msg.sender, amountToSell);
    }

    function cancelMatch(
        bytes memory orderData,
        bytes memory signature
    ) external checkSignature(orderData, signature) {
        (bytes4 selector, uint chainid, uint id) = abi.decode(orderData, (bytes4, uint, uint));
        require(selector == this.cancelMatch.selector, "Wrong Selector");
        _checkChainid(chainid);
        require(matchStatus[id] == Status.AWAITING_FINALIZATION, "Order's status is wrong");

        Match storage order = matches[id];
        matchStatus[id] = Status.CANCALLED;
        release(order.tokenToSell, order.account, order.account, order.amountToSell);
    }

    function finializeMatch(
        bytes memory orderData,
        bytes memory signature
    ) external checkSignature(orderData, signature) {
        (bytes4 selector, uint chainid, uint id, address reciever) = abi.decode(
            orderData,
            (bytes4, uint, uint, address)
        );
        require(selector == this.finializeMatch.selector, "Wrong Selector");
        _checkChainid(chainid);
        require(matchStatus[id] == Status.AWAITING_FINALIZATION, "Order's status is wrong");

        Match storage order = matches[id];
        matchStatus[id] = Status.EXECUTED;
        release(order.tokenToSell, order.account, reciever, order.amountToSell);
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

    function _checkSignature(bytes memory orderData, bytes memory signature) internal {
        address signer = orderData.toEthSignedMessageHash().recover(signature);
        require(signer == validator, "Signer must be ...");
    }

    function _checkChainid(uint256 chainid) internal {
        require(block.chainid == chainid, "ChainId Error");
    }
}
