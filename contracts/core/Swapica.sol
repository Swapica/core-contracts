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

    Order[] public orders;
    Match[] public matches;

    mapping(address => User) internal _userInfos;

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
        address user,
        uint256 offset,
        uint256 limit
    ) external view override returns (Order[] memory userOrders) {
        uint256[] memory orderIds = _userInfos[user].orderIds.part(offset, limit);

        userOrders = new Order[](orderIds.length);

        for (uint256 i; i < userOrders.length; i++) {
            userOrders[i] = orders[orderIds[i]];
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
            userMatches[i] = matches[matchIds[i]];
        }
    }

    function getAllOrders(
        uint256 offset,
        uint256 limit
    ) external view override returns (Order[] memory allOrders) {
        uint256 to = (offset + limit).min(orders.length).max(offset);

        allOrders = new Order[](to - offset);

        for (uint256 i = offset; i < to; i++) {
            allOrders[i - offset] = orders[i];
        }
    }

    function getUserOrdersLength(address user) external view override returns (uint256) {
        return _userInfos[user].orderIds.length;
    }

    function getUserMatchesLength(address user) external view override returns (uint256) {
        return _userInfos[user].matchIds.length;
    }

    function getAllOrdersLength() external view override returns (uint256) {
        return orders.length;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
