// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@dlsl/dev-modules/libs/arrays/Paginator.sol";

import "../interfaces/core/ISwapica.sol";

import "./Globals.sol";
import "../multisig/Signers.sol";

contract Swapica is ISwapica, UUPSUpgradeable, Signers {
    using Paginator for uint256[];
    using Math for uint256;
    using SafeERC20 for IERC20;

    Order[] internal _orders;
    Match[] internal _matches;

    mapping(address => User) internal _userInfos;

    event OrderUpdated(uint256 indexed orderId, OrderStatus status);
    event MatchUpdated(uint256 indexed matchId, State status);

    modifier checkSignature(bytes calldata orderData, bytes[] calldata signatures) {
        _checkSignatures(keccak256(orderData), signatures);
        _;
    }

    function __Swapica_init(address[] calldata signers) external initializer {
        __Signers_init(signers, signers.length);
    }

    function createOrder(CreateOrderRequest memory request) external payable override {
        OrderStatus memory status;
        status.state = State.AWAITING_MATCH;

        uint256 orderId = _orders.length + 1;

        _orders.push(
            Order({
                status: status,
                orderId: orderId,
                creator: msg.sender,
                tokenToSell: request.tokenToSell,
                amountToSell: request.amountToSell,
                tokenToBuy: request.tokenToBuy,
                amountToBuy: request.amountToBuy,
                destinationChain: request.destinationChain
            })
        );

        _userInfos[msg.sender].orderIds.push(orderId - 1);

        _lock(request.tokenToSell, msg.sender, request.amountToSell);

        emit OrderUpdated(orderId, status);
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

        _matches.push(
            Match({
                state: State.AWAITING_FINALIZATION,
                matchId: matchId,
                originOrderId: request.orderId,
                creator: msg.sender,
                tokenToSell: request.tokenToSell,
                amountToSell: request.amountToSell,
                originChainId: request.originChain
            })
        );

        _userInfos[msg.sender].matchIds.push(matchId - 1);

        _lock(request.tokenToSell, msg.sender, request.amountToSell);

        emit MatchUpdated(matchId, State.AWAITING_FINALIZATION);
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
            userOrders[i] = _orders[orderIds[i]];
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
            userMatches[i] = _matches[matchIds[i]];
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

    function getUserOrdersLength(address user) external view override returns (uint256) {
        return _userInfos[user].orderIds.length;
    }

    function getUserMatchesLength(address user) external view override returns (uint256) {
        return _userInfos[user].matchIds.length;
    }

    function getAllOrdersLength() external view override returns (uint256) {
        return _orders.length;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _lock(address token, address user, uint256 amount) internal {
        bool isNativeCurrency = token == ETHEREUM_ADDRESS;

        if (isNativeCurrency) {
            require(amount == msg.value, "Swapica: Wrong amount");
        } else {
            IERC20(token).safeTransferFrom(user, address(this), amount);
        }

        _userInfos[user].lockedAmount[token] += amount;
    }

    function _release(address token, address from, address to, uint256 amount) internal {
        _userInfos[from].lockedAmount[token] -= amount;

        if (token == ETHEREUM_ADDRESS) {
            (bool ok, ) = to.call{value: amount}("");
            require(ok, "Swapica: Transferring failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _checkSignatureRecipient(uint256 chainId, address swapicaAddress) private view {
        require(chainId == block.chainid, "Swapica: Wrong chain id");
        require(swapicaAddress == address(this), "Swapica: Wrong swapica address");
    }
}
