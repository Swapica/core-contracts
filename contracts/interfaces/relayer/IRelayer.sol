// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @notice The Relayer contract.
 *
 * This contract delegates the execution of matches and orders to the Swapica contract and collects commissions
 */
interface IRelayer {
    /**
     * @notice The struct that represents parameters for the orders and matches execution
     * @param token the address of the token to be transferred
     * @param commission the commission percentage to be deducted from transferred tokens
     * @param receiver the address of the receiver of transferred tokens
     * @param coreData the execution data to be delegated to the Swapica contract
     */
    struct ExecuteParameters {
        address token;
        uint256 commission;
        address receiver;
        bytes coreData;
    }

    /**
     * @notice The function to execute matches and orders
     * @param data the encoded `ExecuteParameters` containing the execution data
     * @param signatures the array of signatures of encoded execution parameters
     */
    function execute(bytes calldata data, bytes[] calldata signatures) external;

    /**
     * @notice The function to withdraw collected commissions
     * @param tokens the array of token addresses for which to withdraw collected commissions
     * @param to the address to which the collected commissions will be transferred
     */
    function withdraw(address[] calldata tokens, address to) external;
}
