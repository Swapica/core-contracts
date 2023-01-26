// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ISigners {
    function signaturesThreshold() external view returns (uint256);

    function setSignaturesThreshold(uint256 _signaturesThreshold) external;

    function addSigners(address[] calldata signers) external;

    function removeSigners(address[] calldata signers) external;

    function getSigners() external view returns (address[] memory);
}
