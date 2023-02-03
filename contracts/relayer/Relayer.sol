// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/relayer/IRelayer.sol";
import "../interfaces/multisig/ISigners.sol";

import "../libs/TokenBalance.sol";
import "../libs/MathHelper.sol";
import "../libs/DataHelper.sol";

contract Relayer is IRelayer, OwnableUpgradeable, UUPSUpgradeable {
    using TokenBalance for address;
    using MathHelper for uint256;
    using DataHelper for bytes;

    address public coreAddress;

    function __Relayer_init(address _coreAddress) external initializer {
        __Ownable_init();

        coreAddress = _coreAddress;
    }

    function execute(bytes calldata data, bytes[] calldata signatures) external override {
        ISigners(coreAddress).checkSignatures(keccak256(data), signatures);

        ExecuteParameters memory executeParameters = abi.decode(data, (ExecuteParameters));

        uint256 balanceBefore = executeParameters.token.thisBalance();

        (bool status, bytes memory returnedData) = coreAddress.call(executeParameters.coreData);
        require(status, returnedData.getRevertMsg());

        uint256 balanceAfter = executeParameters.token.thisBalance();

        executeParameters.token.sendFunds(
            executeParameters.receiver,
            (balanceAfter - balanceBefore).percentage(
                PERCENTAGE_100 - executeParameters.commission
            )
        );
    }

    function withdraw(address[] calldata tokens, address to) external override onlyOwner {
        for (uint256 i; i < tokens.length; i++) {
            tokens[i].sendFunds(to, tokens[i].thisBalance());
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
