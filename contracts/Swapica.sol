pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Signers.sol";

contract Swapica is UUPSUpgradeable, Signers {
    address constant public NATIVE = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);

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
    struct User {
        uint[] orderIds;
        uint[] matchIds;
    }

    Order[] public orders;
    Match[] public matches;
    mapping(uint => Status) public orderStatus;
    mapping(uint => Status) public matchStatus;
    mapping(address => mapping(address => uint)) public locked;

    mapping(address => User) internal userInfo;

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
    ) external payable {
        uint id = orders.length;
        _lock(tokenToSell, msg.sender, amountToSell);
        orderStatus[id].state = State.AWAITING_MATCH;
        emit OrderUpdated(id, orderStatus[id]);
        orders.push(
            Order(id, msg.sender, tokenToSell, tokenToBuy, amountToSell, amountToBuy, destChain)
        );
        userInfo[msg.sender].orderIds.push(id);
    }

    function cancelOrder(uint id) external {
        Order storage order = orders[id];
        require(orderStatus[id].state == State.AWAITING_MATCH, "Order status is wrong");
        require(order.account == msg.sender);
        orderStatus[id].state = State.CANCELED;
        emit OrderUpdated(id, orderStatus[id]);
        _release(order.tokenToSell, order.account, order.account, order.amountToSell);
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
        emit OrderUpdated(id, orderStatus[id]);
        _release(order.tokenToSell, order.account, receiver, order.amountToSell);
    }

    /// MATCH PART

    function createMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external payable checkSignature(orderData, signatures) {
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

        _lock(tokenToSell, msg.sender, amountToSell);
        uint id = matches.length;
        matches.push(Match(id, orderId, msg.sender, tokenToSell, amountToSell, originChain));
        matchStatus[id].state = State.AWAITING_FINALIZATION;
        emit MatchUpdated(id, matchStatus[id]);
        userInfo[msg.sender].matchIds.push(id);
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
        require(matchStatus[id].state == State.AWAITING_FINALIZATION, "Order status is wrong");

        Match storage order = matches[id];
        require(order.account == msg.sender);
        matchStatus[id].state = State.CANCELED;
        emit MatchUpdated(id, matchStatus[id]);
        _release(order.tokenToSell, order.account, order.account, order.amountToSell);
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
        require(matchStatus[id].state == State.AWAITING_FINALIZATION, "Order status is wrong");

        Match storage order = matches[id];
        matchStatus[id].state = State.EXECUTED;
        emit MatchUpdated(id, matchStatus[id]);
        _release(order.tokenToSell, order.account, receiver, order.amountToSell);
    }

    /// VIEW
    function getUserOrders(
        address user,
        uint begin,
        uint end
    ) external view returns (Order[] memory result) {
        uint[] storage ids = userInfo[user].orderIds;
        if (ids.length == 0) return result;
        if (begin > ids.length) begin = ids.length;
        if (end > ids.length) end = ids.length;
        if (end <= begin) return result;
        result = new Order[](end - begin);
        for (uint i = 0; i < result.length; i++) {
            result[i] = orders[ids[begin + i]];
        }
    }

    function getUserMatches(
        address user,
        uint begin,
        uint end
    ) external view returns (Match[] memory result) {
        uint[] storage ids = userInfo[user].matchIds;
        if (ids.length == 0) return result;
        if (begin > ids.length) begin = ids.length;
        if (end > ids.length) end = ids.length;
        if (end <= begin) return result;
        result = new Match[](end - begin);
        for (uint i = 0; i < result.length; i++) {
            result[i] = matches[ids[begin + i]];
        }
    }

    function getActiveOrders(uint begin, uint end) external view returns (Order[] memory result) {
        Order[] storage ids = orders;
        if (ids.length == 0) return result;
        if (begin > ids.length) begin = ids.length;
        if (end > ids.length) end = ids.length;
        if (end <= begin) return result;
        uint count;
        for (uint i = begin; i < end; i++) {
            State s = orderStatus[i].state;
            if (s == State.EXECUTED || s == State.CANCELED) continue;
            count++;
        }
        result = new Order[](count);
        uint j;
        for (uint i = begin; i < end; i++) {
            State s = orderStatus[i].state;
            if (s == State.EXECUTED || s == State.CANCELED) continue;
            result[j++] = ids[i];
        }
    }

    /// FUNDS MANIPULATION

    function _lock(address coin, address account, uint amount) internal {
        locked[account][coin] += amount;
        if (NATIVE == coin) {
            require(msg.value == amount, "Value is not equal to amount");
        } else {
            SafeERC20.safeTransferFrom(IERC20(coin), account, address(this), amount);
        }
    }

    function _release(address coin, address account, address to, uint amount) internal {
        locked[account][coin] -= amount;
        if (NATIVE == coin) {
            (bool _s, ) = to.call{value: amount}("");
            require(_s, "Transferring failed");
        } else {
            SafeERC20.safeTransfer(IERC20(coin), to, amount);
        }
    }

    function _checkSignatureRecipient(uint256 chainid, address swapica) internal {
        require(block.chainid == chainid && address(this) == swapica, "Wrong Signature Recipient");
    }
}
