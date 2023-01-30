// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ISwapica {
    enum Selector {
        EXECUTE_ORDER,
        EXECUTE_MATCH,
        CREATE_MATCH,
        CANCEL_MATCH
    }

    enum State {
        NONE,
        AWAITING_MATCH,
        AWAITING_FINALIZATION,
        CANCELED,
        EXECUTED
    }

    struct Order {
        OrderStatus status;
        uint256 orderId;
        address creator;
        address tokenToSell;
        uint256 amountToSell;
        address tokenToBuy;
        uint256 amountToBuy;
        uint256 destinationChain;
    }

    struct Match {
        State state;
        uint256 matchId;
        uint256 originOrderId;
        address creator;
        address tokenToSell;
        uint256 amountToSell;
        uint256 originChainId;
    }

    struct OrderStatus {
        State state;
        uint256 matchId;
        address matchSwapica;
    }

    struct User {
        uint256[] orderIds;
        uint256[] matchIds;
        mapping(address => uint256) lockedAmount;
    }

    struct CreateOrderRequest {
        address tokenToSell;
        uint256 amountToSell;
        address tokenToBuy;
        uint256 amountToBuy;
        uint256 destinationChain;
    }

    struct ExecuteOrderRequest {
        Selector selector;
        uint256 chainId;
        address orderSwapica;
        uint256 orderId;
        address receiver;
        address matchSwapica;
        uint256 matchId;
    }

    struct CreateMatchRequest {
        Selector selector;
        uint256 chainId;
        address matchSwapica;
        uint256 orderId;
        address tokenToSell;
        uint256 amountToSell;
        uint256 originChain;
    }

    struct CancelMatchRequest {
        Selector selector;
        uint256 chainId;
        address matchSwapica;
        uint256 matchId;
    }

    struct ExecuteMatchRequest {
        Selector selector;
        uint256 chainId;
        address matchSwapica;
        uint256 matchId;
        address receiver;
    }

    function createOrder(CreateOrderRequest memory request) external payable;

    function cancelOrder(uint256 orderId) external;

    function executeOrder(bytes calldata data, bytes[] calldata signatures) external;

    function createMatch(bytes calldata data, bytes[] calldata signatures) external payable;

    function cancelMatch(bytes calldata data, bytes[] calldata signatures) external;

    function executeMatch(bytes calldata data, bytes[] calldata signatures) external;

    function getUserOrders(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (Order[] memory userOrders);

    function getUserMatches(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (Match[] memory userMatches);

    function getAllOrders(
        uint256 offset,
        uint256 limit
    ) external view returns (Order[] memory allOrders);

    function getUserOrdersLength(address user) external view returns (uint256);

    function getUserMatchesLength(address user) external view returns (uint256);

    function getAllOrdersLength() external view returns (uint256);
}
