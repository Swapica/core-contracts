// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ISwapica {
    /**
     * @notice The enum that represents the operation selectors
     * @param EXECUTE_ORDER the type corresponding to the Execute Order request
     * @param EXECUTE_MATCH the type corresponding to the Execute Match request
     * @param CREATE_MATCH the type corresponding to the Create Match request
     * @param CANCEL_MATCH the type corresponding to the Cancel Match request
     */
    enum Selector {
        EXECUTE_ORDER,
        EXECUTE_MATCH,
        CREATE_MATCH,
        CANCEL_MATCH
    }

    /**
     * @notice The enum that represents state of orders and matches
     * @param NONE the default state indicating no specific state.
     * @param AWAITING_MATCH the state indicating the order awaiting for the match
     * @param AWAITING_FINALIZATION the state indicating the match awaiting for the execution
     * @param CANCELED the state indicating the order or match has been canceled
     * @param EXECUTED the state indicating the order or match has been executed
     */
    enum State {
        NONE,
        AWAITING_MATCH,
        AWAITING_FINALIZATION,
        CANCELED,
        EXECUTED
    }

    /**
     * @notice The struct that represents an Order
     * @param status the status of the order
     * @param orderId the unique identifier of the order
     * @param creator the address of the creator of the order
     * @param tokenToSell the address of the token being sold
     * @param amountToSell the amount of the token being sold
     * @param tokenToBuy the address of the token being bought
     * @param amountToBuy the amount of the token being bought
     * @param destinationChain the identifier of the destination chain
     */
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

    /**
     * @notice The struct that represents a Match
     * @param state the state of the match
     * @param matchId the unique identifier of the match
     * @param originOrderId the identifier of the original order associated with the match
     * @param creator the address of the creator of the match
     * @param tokenToSell the address of the token being sold
     * @param amountToSell the amount of the token being sold
     * @param originChainId the identifier of the origin chain
     */
    struct Match {
        State state;
        uint256 matchId;
        uint256 originOrderId;
        address creator;
        address tokenToSell;
        uint256 amountToSell;
        uint256 originChainId;
    }

    /**
     * @notice The struct that represents the status of the corresponding order
     * @param state the state of the order
     * @param matchId the unique identifier of the match associated with the order
     * @param matchSwapica the address of the Swapica contract handling the associated match
     */
    struct OrderStatus {
        State state;
        uint256 matchId;
        address matchSwapica;
    }

    /*
     * @notice The struct that represents a User
     * @param orderIds the array of order identifiers associated with the user
     * @param matchIds the array of match identifiers associated with the user
     * @param lockedAmount the mapping of token addresses to amounts of tokens locked in open orders and matches
     */
    struct User {
        uint256[] orderIds;
        uint256[] matchIds;
        mapping(address => uint256) lockedAmount;
    }

    /**
     * @notice The struct that represents a Create Order request.
     * @param useRelayer the boolean flag indicating whether to use a relayer for the corresponding match execution
     * @param tokenToSell the address of the token being sold
     * @param amountToSell the amount of the token being sold
     * @param tokenToBuy the address of the token being bought
     * @param amountToBuy the amount of the token being bought
     * @param destinationChain the identifier of the destination chain where the match is expected
     */
    struct CreateOrderRequest {
        bool useRelayer;
        address tokenToSell;
        uint256 amountToSell;
        address tokenToBuy;
        uint256 amountToBuy;
        uint256 destinationChain;
    }

    /**
     * @notice The struct that represents an Execute Order request
     * @param selector the selector indicating the type of the operation to execute
     * @param chainId the identifier of the chain where the order is executed
     * @param orderSwapica the address of the Swapica contract handling the order
     * @param orderId the identifier of the order
     * @param receiver the address of the receiver of executed order tokens
     * @param matchSwapica the address of the Swapica contract handling the associated match
     * @param matchId the identifier of the associated match
     */
    struct ExecuteOrderRequest {
        Selector selector;
        uint256 chainId;
        address orderSwapica;
        uint256 orderId;
        address receiver;
        address matchSwapica;
        uint256 matchId;
    }

    /**
     * @notice The struct that represents a Create Match request
     * @param useRelayer the boolean flag indicating whether to use a relayer for the corresponding order execution
     * @param selector the selector indicating the type of the operation to execute
     * @param chainId the identifier of the chain where the match is created
     * @param matchSwapica the address of the Swapica contract handling the match
     * @param orderId the identifier of the associated order
     * @param tokenToSell the address of the token being sold
     * @param amountToSell the amount of the token being sold
     * @param originChain the identifier of the chain where the corresponding order was created
     */
    struct CreateMatchRequest {
        bool useRelayer;
        Selector selector;
        uint256 chainId;
        address matchSwapica;
        uint256 orderId;
        address tokenToSell;
        uint256 amountToSell;
        uint256 originChain;
    }

    /**
     * @notice The struct that represents a Cancel Match request
     * @param selector the selector indicating the type of the operation to execute
     * @param chainId the identifier of the chain where the match is canceled
     * @param matchSwapica the address of the Swapica contract handling the match
     * @param matchId the identifier of the match to be canceled
     */
    struct CancelMatchRequest {
        Selector selector;
        uint256 chainId;
        address matchSwapica;
        uint256 matchId;
    }

    /**
     * @notice The struct that represents an Execute Match request
     * @param selector the selector indicating the type of the operation to execute
     * @param chainId the identifier of the chain where the match is executed
     * @param matchSwapica the address of the Swapica contract handling the match
     * @param matchId the identifier of the match to be executed
     * @param receiver the address of the receiver of executed match tokens
     */
    struct ExecuteMatchRequest {
        Selector selector;
        uint256 chainId;
        address matchSwapica;
        uint256 matchId;
        address receiver;
    }

    /**
     * @notice The function that creates orders
     * @param request the `CreateOrderRequest` containing the order creation data
     */
    function createOrder(CreateOrderRequest calldata request) external payable;

    /**
     * @notice The function that cancels orders
     * @param orderId the identifier of the order to be canceled
     */
    function cancelOrder(uint256 orderId) external;

    /**
     * @notice The function that executes orders
     * @param data the encoded `ExecuteOrderRequest` containing the order execution data
     * @param signatures the array of signatures of the encoded request
     */
    function executeOrder(bytes calldata data, bytes[] calldata signatures) external;

    /**
     * @notice The function that creates matches
     * @param data the encoded `CreateMatchRequest` containing the match creation data
     * @param signatures the array of signatures of the encoded request
     */
    function createMatch(bytes calldata data, bytes[] calldata signatures) external payable;

    /**
     * @notice The function that cancels matches
     * @param data the encoded `CancelMatchRequest` containing the match cancellation data
     * @param signatures the array of signatures of the encoded request
     */
    function cancelMatch(bytes calldata data, bytes[] calldata signatures) external;

    /**
     * @notice The function that executes matches
     * @param data the encoded `ExecuteMatchRequest` containing the match execution data
     * @param signatures the array of signatures of the encoded request
     */
    function executeMatch(bytes calldata data, bytes[] calldata signatures) external;

    /**
     * @notice The function to get orders of the specific user
     * @param user the address of the user
     * @param offset the offset from which to get user orders
     * @param limit the maximum number of orders to get
     * @return userOrders the array of orders belonging to the user
     */
    function getUserOrders(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (Order[] memory userOrders);

    /**
     * @notice The function to get matches of the specific user
     * @param user the address of the user
     * @param offset the offset from which to get user matches
     * @param limit the maximum number of matches to get
     * @return userMatches the array of matches belonging to the user
     */
    function getUserMatches(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (Match[] memory userMatches);

    /**
     * @notice The function to get orders all orders handling by the contract
     * @param offset the offset from which to get orders
     * @param limit the maximum number of orders to get
     * @return allOrders the array of orders
     */
    function getAllOrders(
        uint256 offset,
        uint256 limit
    ) external view returns (Order[] memory allOrders);

    /**
     * @notice The function to get orders all matches handling by the contract
     * @param offset the offset from which to get matches
     * @param limit the maximum number of matches to get
     * @return allMatches the array of matches
     */
    function getAllMatches(
        uint256 offset,
        uint256 limit
    ) external view returns (Match[] memory allMatches);

    /**
     * @notice The function to get the number of orders belonging to the specific user
     * @param user the address of the user
     * @return The number of user's orders
     */
    function getUserOrdersLength(address user) external view returns (uint256);

    /**
     * @notice The function to get the number of matches belonging to the specific user
     * @param user the address of the user
     * @return The number of user's matches
     */
    function getUserMatchesLength(address user) external view returns (uint256);

    /**
     * @notice The function to get the number of all orders handling by the contract
     * @return The total number of orders
     */
    function getAllOrdersLength() external view returns (uint256);

    /**
     * @notice The function to get the number of all matches handling by the contract
     * @return The total number of matches
     */
    function getAllMatchesLength() external view returns (uint256);
}
