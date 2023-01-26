// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/core/ISwapica.sol";

import "./Globals.sol";
import "../multisig/Signers.sol";

contract Swapica is ISwapica, UUPSUpgradeable, Signers {
    event OrderUpdated(uint256 indexed id, OrderStatus status);
    event MatchUpdated(uint256 indexed id, State status);

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
    ) external payable override {}

    function cancelOrder(uint256 orderId) external {}

    function executeOrder(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external override checkSignature(orderData, signatures) {}

    function createMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external payable override checkSignature(orderData, signatures) {}

    function cancelMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external override checkSignature(orderData, signatures) {}

    function executeMatch(
        bytes calldata orderData,
        bytes[] calldata signatures
    ) external override checkSignature(orderData, signatures) {}

    function getUserOrders(
        uint256 limit,
        uint256 offset
    ) external view override returns (Order[] memory orders) {
        return new Order[](0);
    }

    function getUserMatches(
        address user,
        uint256 limit,
        uint256 offset
    ) external view override returns (Match[] memory matches) {
        return new Match[](0);
    }

    function getAllOrders(
        uint256 limit,
        uint256 offset
    ) external view override returns (Order[] memory orders) {
        return new Order[](0);
    }

    function getUserOrdersLength(address user) external view override returns (uint256) {
        return 0;
    }

    function getUserMatchesLength() external view override returns (uint256) {
        return 0;
    }

    function getAllOrdersLength() external view override returns (uint256) {
        return 0;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
