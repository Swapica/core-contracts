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

    function createOrder(
        address tokenToSell,
        uint256 amountToSell,
        address tokenToBuy,
        uint256 amountToBuy,
        uint256 destinationChain
    ) external payable override {
        OrderStatus memory status;
        status.state = State.AWAITING_MATCH;

        uint256 orderId = _orders.length + 1;

        _orders.push(
            Order({
                status: status,
                orderId: orderId,
                creator: msg.sender,
                tokenToSell: tokenToSell,
                amountToSell: amountToSell,
                tokenToBuy: tokenToBuy,
                amountToBuy: amountToBuy,
                destinationChain: destinationChain
            })
        );

        _userInfos[msg.sender].orderIds.push(orderId - 1);

        _lock(tokenToSell, msg.sender, amountToSell);

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
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external override checkSignature(orderData, signatures) {
        (
            Selector selector,
            uint256 chainId,
            address orderSwapica,
            uint256 orderId,
            address receiver,
            address matchSwapica,
            uint256 matchId
        ) = abi.decode(
                orderData,
                (Selector, uint256, address, uint256, address, address, uint256)
            );

        Order storage order = _orders[orderId - 1];

        require(selector == Selector.EXECUTE_ORDER, "Swapica: Wrong selector");
        require(order.status.state == State.AWAITING_MATCH, "Swapica: Order status is wrong");

        _checkSignatureRecipient(chainId, orderSwapica);

        OrderStatus memory status = OrderStatus({
            state: State.EXECUTED,
            matchId: matchId,
            matchSwapica: matchSwapica
        });

        order.status = status;

        _release(order.tokenToSell, order.creator, receiver, order.amountToSell);

        emit OrderUpdated(orderId, status);
    }

    function createMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external payable override checkSignature(orderData, signatures) {
        (
            Selector selector,
            uint256 chainId,
            address matchSwapica,
            uint256 orderId,
            address tokenToSell,
            uint256 amountToSell,
            uint256 originChain
        ) = abi.decode(
                orderData,
                (Selector, uint256, address, uint256, address, uint256, uint256)
            );

        require(selector == Selector.CREATE_MATCH, "Swapica: Wrong selector");

        _checkSignatureRecipient(chainId, matchSwapica);

        uint256 matchId = _matches.length + 1;

        _matches.push(
            Match({
                state: State.AWAITING_FINALIZATION,
                matchId: matchId,
                originOrderId: orderId,
                creator: msg.sender,
                tokenToSell: tokenToSell,
                amountToSell: amountToSell,
                originChainId: originChain
            })
        );

        _userInfos[msg.sender].matchIds.push(matchId - 1);

        _lock(tokenToSell, msg.sender, amountToSell);

        emit MatchUpdated(matchId, State.AWAITING_FINALIZATION);
    }

    function cancelMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external override checkSignature(orderData, signatures) {
        (Selector selector, uint256 chainId, address matchSwapica, uint256 matchId) = abi.decode(
            orderData,
            (Selector, uint256, address, uint256)
        );

        Match storage match_ = _matches[matchId - 1];

        require(selector == Selector.CANCEL_MATCH, "Swapica: Wrong selector");
        require(match_.state == State.AWAITING_FINALIZATION, "Swapica: Match state is wrong");
        require(match_.creator == msg.sender, "Swapica: You're not a creator of the match");

        _checkSignatureRecipient(chainId, matchSwapica);

        match_.state = State.CANCELED;

        _release(match_.tokenToSell, match_.creator, match_.creator, match_.amountToSell);

        emit MatchUpdated(matchId, State.CANCELED);
    }

    function executeMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external override checkSignature(orderData, signatures) {
        (
            Selector selector,
            uint256 chainid,
            address matchSwapica,
            uint256 matchId,
            address receiver
        ) = abi.decode(orderData, (Selector, uint256, address, uint256, address));

        Match storage match_ = _matches[matchId - 1];

        require(selector == Selector.EXECUTE_MATCH, "Swapica: Wrong selector");
        require(match_.state == State.AWAITING_FINALIZATION, "Swapica: Match status is wrong");

        _checkSignatureRecipient(chainid, matchSwapica);

        match_.state = State.EXECUTED;

        _release(match_.tokenToSell, match_.creator, receiver, match_.amountToSell);

        emit MatchUpdated(matchId, State.EXECUTED);
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

        _userInfos[user].lockedAmount[token] += isNativeCurrency ? msg.value : amount;

        if (!isNativeCurrency) {
            IERC20(token).safeTransferFrom(user, address(this), amount);
        }
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
