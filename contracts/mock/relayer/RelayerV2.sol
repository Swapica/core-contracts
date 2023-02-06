// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../relayer/Relayer.sol";

contract RelayerV2 is Relayer {
    function RELAYER_V2_NAME() external pure returns (string memory) {
        return "RELAYER_V2_NAME";
    }
}
