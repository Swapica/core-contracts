// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @notice The Signers contract.
 *
 * This contract manages the list of signers and provides functionalities for validating signatures
 */
interface ISigners {
    /**
     * @notice The function to get the threshold for the number of required signatures
     * @return The threshold for the number of required signatures
     */
    function signaturesThreshold() external view returns (uint256);

    /**
     * @notice The function the set the threshold for the number of required signatures
     * @param _signaturesThreshold the threshold for the number of required signatures to be set
     */
    function setSignaturesThreshold(uint256 _signaturesThreshold) external;

    /**
     * @notice The function to add signers
     * @param signers the array of signers to be added
     */
    function addSigners(address[] calldata signers) external;

    /**
     * @notice The function to remove signers
     * @param signers the array of signers to be removed
     */
    function removeSigners(address[] calldata signers) external;

    /**
     * @notice The function to get the list of signers
     * @return The array of signers
     */
    function getSigners() external view returns (address[] memory);

    /**
     * @notice The function to check the validity of provided signatures for a given hash
     * @param signHash the signed hash
     * @param signatures the array of signatures to be checked
     */
    function checkSignatures(bytes32 signHash, bytes[] calldata signatures) external view;
}
