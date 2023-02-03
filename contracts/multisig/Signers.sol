// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/multisig/ISigners.sol";

abstract contract Signers is ISigners, OwnableUpgradeable {
    using ECDSA for bytes32;
    using ECDSA for bytes;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public override signaturesThreshold;

    EnumerableSet.AddressSet internal _signers;

    function __Signers_init(
        address[] calldata signers_,
        uint256 signaturesThreshold_
    ) public onlyInitializing {
        __Ownable_init();

        addSigners(signers_);
        setSignaturesThreshold(signaturesThreshold_);
    }

    function setSignaturesThreshold(uint256 _signaturesThreshold) public override onlyOwner {
        require(_signaturesThreshold > 0, "Signers: invalid threshold");

        signaturesThreshold = _signaturesThreshold;
    }

    function addSigners(address[] calldata signers) public override onlyOwner {
        for (uint256 i = 0; i < signers.length; i++) {
            require(signers[i] != address(0), "Signers: zero signer");

            _signers.add(signers[i]);
        }
    }

    function removeSigners(address[] calldata signers) public override onlyOwner {
        for (uint256 i = 0; i < signers.length; i++) {
            _signers.remove(signers[i]);
        }
    }

    function getSigners() external view override returns (address[] memory) {
        return _signers.values();
    }

    function checkSignatures(bytes32 signHash, bytes[] calldata signatures) public view override {
        address[] memory signers = new address[](signatures.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            signers[i] = signHash.toEthSignedMessageHash().recover(signatures[i]);
        }

        _checkCorrectSigners(signers);
    }

    function _checkCorrectSigners(address[] memory signers) private view {
        uint256 bitMap;

        for (uint256 i = 0; i < signers.length; i++) {
            require(_signers.contains(signers[i]), "Signers: invalid signer");

            uint256 bitKey = 2 ** (uint256(uint160(signers[i])) >> 152);

            require(bitMap & bitKey == 0, "Signers: duplicate signers");

            bitMap |= bitKey;
        }

        require(signers.length >= signaturesThreshold, "Signers: threshold is not met");
    }
}
