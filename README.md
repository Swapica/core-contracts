# Swapica contracts

This repository contains Swapica core contracts. All contracts are managed and indexed by backend services using EIP-712 standard signatures.
- `./contracts/core/Swapica.sol` Swapica contract, which allows creating, executing, and canceling orders and matches.
- `./contracts/relayer/Relayer.sol` Relayer contract that facilitates the orders matching by executing executeOrder and executeMatch methods on the Swapica contract. The Relayer is optional, and it charges set fees from users for this service.

## Overview

###  Installation

```console
$ npm install @swapica/core-contracts
```

###  Run Tests

```console
$ npm run test
```

### Deployment
To deploy contracts, first configure `./.env` based on the `./.env.example` file. After that, you can run the migration script with the desired network (see `./packge.json` scripts):

```console
$ npm run deploy-sepolia
```

## Usage

Once the npm package is installed, one can use the swapica core contracts just like that:

```solidity
pragma solidity ^0.8.19;

import "@swapica/core-contracts/interfaces/core/ISwapica.sol";

contract ExampleContract {
    function getLatestOrder(address swapica) external view returns (ISwapica.Order memory order) {
        uint256 ordersLength = ISwapica(swapica).getUserOrdersLength(msg.sender);

        require(ordersLength > 0, "ExampleContract: no orders");

        return ISwapica(swapica).getUserOrders(msg.sender, ordersLength - 1, 1)[0];
    }
}
```
