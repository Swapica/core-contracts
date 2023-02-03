// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IRelayer {
    struct ExecuteParameters {
        address token;
        uint256 commission;
        address receiver;
        bytes coreData;
    }

    function execute(bytes calldata data, bytes[] calldata signatures) external;

    function withdraw(address[] calldata tokens, address to) external;
}
