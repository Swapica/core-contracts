// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/arrays/Paginator.sol";

import "../interfaces/core/ISwapica.sol";
import "../multisig/Signers.sol";
import "../libs/TokenBalance.sol";

contract Swapica is ISwapica, UUPSUpgradeable, Signers {
    using Paginator for uint256[];
    using Math for uint256;
    using SafeERC20 for IERC20;
    using TokenBalance for address;

    Order[] internal _orders;
    Match[] internal _matches;

    mapping(address => User) internal _userInfos;

    event OrderUpdated(uint256 indexed orderId, OrderStatus status);
    event MatchUpdated(uint256 indexed matchId, State status);
    event OrderCreated(Order order, bool useRelayer);
    event MatchCreated(Match match_, bool useRelayer);

    modifier checkSignature(bytes calldata orderData, bytes[] calldata signatures) {
        checkSignatures(keccak256(orderData), signatures);
        _;
    }

    function __Swapica_init(address[] calldata signers) external initializer {
        __Signers_init(signers, signers.length);
    }

    function createOrder(CreateOrderRequest calldata request) external payable override {
        OrderStatus memory status;
        status.state = State.AWAITING_MATCH;

        uint256 orderId = _orders.length + 1;

        Order memory order = Order({
            status: status,
            orderId: orderId,
            creator: msg.sender,
            tokenToSell: request.tokenToSell,
            amountToSell: request.amountToSell,
            tokenToBuy: request.tokenToBuy,
            amountToBuy: request.amountToBuy,
            destinationChain: request.destinationChain
        });

        _orders.push(order);

        _userInfos[msg.sender].orderIds.push(orderId);
        _lock(request.tokenToSell, msg.sender, request.amountToSell);

        emit OrderCreated(order, request.useRelayer);
    }

    function cancelOrder(uint256 orderId) external {
        Order storage order = _orders[orderId - 1];

        address orderCreator = order.creator;

        require(order.status.state == State.AWAITING_MATCH, "Swapica: Order status is wrong");
        require(orderCreator == msg.sender, "Swapica: You're not a creator of the order");

        order.status.state = State.CANCELED;

        _release(order.tokenToSell, orderCreator, orderCreator, order.amountToSell);

        emit OrderUpdated(orderId, order.status);
    }

    function executeOrder(
        bytes calldata data,
        bytes[] calldata signatures
    ) external override checkSignature(data, signatures) {
        ExecuteOrderRequest memory request = abi.decode(data, (ExecuteOrderRequest));

        Order storage order = _orders[request.orderId - 1];

        require(request.selector == Selector.EXECUTE_ORDER, "Swapica: Wrong selector");
        require(order.status.state == State.AWAITING_MATCH, "Swapica: Order status is wrong");

        _checkSignatureRecipient(request.chainId, request.orderSwapica);

        OrderStatus memory status = OrderStatus({
            state: State.EXECUTED,
            matchId: request.matchId,
            matchSwapica: request.matchSwapica
        });

        order.status = status;

        _release(order.tokenToSell, order.creator, request.receiver, order.amountToSell);

        emit OrderUpdated(request.orderId, status);
    }

    function createMatch(
        bytes calldata data,
        bytes[] calldata signatures
    ) external payable override checkSignature(data, signatures) {
        CreateMatchRequest memory request = abi.decode(data, (CreateMatchRequest));

        require(request.selector == Selector.CREATE_MATCH, "Swapica: Wrong selector");

        _checkSignatureRecipient(request.chainId, request.matchSwapica);

        uint256 matchId = _matches.length + 1;

        Match memory match_ = Match({
            state: State.AWAITING_FINALIZATION,
            matchId: matchId,
            originOrderId: request.orderId,
            creator: msg.sender,
            tokenToSell: request.tokenToSell,
            amountToSell: request.amountToSell,
            originChainId: request.originChain
        });

        _matches.push(match_);

        _userInfos[msg.sender].matchIds.push(matchId);
        _lock(request.tokenToSell, msg.sender, request.amountToSell);

        emit MatchCreated(match_, request.useRelayer);
    }

    function cancelMatch(
        bytes calldata data,
        bytes[] calldata signatures
    ) external override checkSignature(data, signatures) {
        CancelMatchRequest memory request = abi.decode(data, (CancelMatchRequest));

        Match storage match_ = _matches[request.matchId - 1];

        require(request.selector == Selector.CANCEL_MATCH, "Swapica: Wrong selector");
        require(match_.state == State.AWAITING_FINALIZATION, "Swapica: Match state is wrong");
        require(match_.creator == msg.sender, "Swapica: You're not a creator of the match");

        _checkSignatureRecipient(request.chainId, request.matchSwapica);

        match_.state = State.CANCELED;

        _release(match_.tokenToSell, match_.creator, match_.creator, match_.amountToSell);

        emit MatchUpdated(request.matchId, State.CANCELED);
    }

    function executeMatch(
        bytes calldata data,
        bytes[] calldata signatures
    ) external override checkSignature(data, signatures) {
        ExecuteMatchRequest memory request = abi.decode(data, (ExecuteMatchRequest));

        Match storage match_ = _matches[request.matchId - 1];

        require(request.selector == Selector.EXECUTE_MATCH, "Swapica: Wrong selector");
        require(match_.state == State.AWAITING_FINALIZATION, "Swapica: Match status is wrong");

        _checkSignatureRecipient(request.chainId, request.matchSwapica);

        match_.state = State.EXECUTED;

        _release(match_.tokenToSell, match_.creator, request.receiver, match_.amountToSell);

        emit MatchUpdated(request.matchId, State.EXECUTED);
    }

    function getUserOrders(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (Order[] memory userOrders) {
        uint256[] memory orderIds = _userInfos[user].orderIds.part(offset, limit);

        userOrders = new Order[](orderIds.length);

        for (uint256 i; i < userOrders.length; i++) {
            userOrders[i] = _orders[orderIds[i] - 1];
        }
    }

    function getUserMatches(
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (Match[] memory userMatches) {
        uint256[] memory matchIds = _userInfos[user].matchIds.part(offset, limit);

        userMatches = new Match[](matchIds.length);

        for (uint256 i; i < userMatches.length; i++) {
            userMatches[i] = _matches[matchIds[i] - 1];
        }
    }

    function getAllOrders(
        uint256 offset,
        uint256 limit
    ) external view override returns (Order[] memory allOrders) {
        uint256 to = (offset + limit).min(_orders.length).max(offset);

        allOrders = new Order[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            allOrders[i - offset] = _orders[i];
        }
    }

    function getAllMatches(
        uint256 offset,
        uint256 limit
    ) external view override returns (Match[] memory allMatches) {
        uint256 to = (offset + limit).min(_matches.length).max(offset);

        allMatches = new Match[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            allMatches[i - offset] = _matches[i];
        }
    }

    function getUserOrdersLength(address user) external view override returns (uint256) {
        return _userInfos[user].orderIds.length;
    }

    function getUserMatchesLength(address user) external view override returns (uint256) {
        return _userInfos[user].matchIds.length;
    }

    function getAllOrdersLength() external view override returns (uint256) {
        return _orders.length;
    }

    function getAllMatchesLength() external view override returns (uint256) {
        return _matches.length;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _lock(address token, address user, uint256 amount) internal {
        if (token == ETHEREUM_ADDRESS) {
            require(amount == msg.value, "Swapica: Wrong amount");
        } else {
            IERC20(token).safeTransferFrom(user, address(this), amount);
        }

        _userInfos[user].lockedAmount[token] += amount;
    }

    function _release(address token, address from, address to, uint256 amount) internal {
        _userInfos[from].lockedAmount[token] -= amount;

        token.sendFunds(to, amount);
    }

    function _checkSignatureRecipient(uint256 chainId, address swapicaAddress) private view {
        require(chainId == block.chainid, "Swapica: Wrong chain id");
        require(swapicaAddress == address(this), "Swapica: Wrong swapica address");
    }
}
