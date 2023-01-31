import { expect } from "chai";
import { ethers } from "hardhat";
import { ERC20Mock, Swapica } from "../generated-types/ethers";

import { cancelMatchBytes, createMatchBytes, executeMatchBytes, executeOrderBytes, signEach } from "./utils/signature";

import { BigNumber, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { wei } from "../scripts/utils/utils";

import {
  CancelMatchRequest,
  CreateMatchRequest,
  ExecuteMatchRequest,
  ExecuteOrderRequest,
  Selector,
  State,
} from "./utils/types";

import { ETHER_ADDR, ZERO_ADDR } from "../scripts/utils/constants";

import { ISwapica } from "../generated-types/ethers/contracts/core/Swapica";

import CreateOrderRequestStruct = ISwapica.CreateOrderRequestStruct;
import OrderStruct = ISwapica.OrderStruct;
import OrderStructOutput = ISwapica.OrderStructOutput;
import MatchStruct = ISwapica.MatchStruct;
import MatchStructOutput = ISwapica.MatchStructOutput;

describe("Swapica", function () {
  const defaultChainId = BigNumber.from(31337);

  let swapica: Swapica;
  let orderToken: ERC20Mock;
  let matchToken: ERC20Mock;
  let owner: SignerWithAddress;
  let orderMaker: SignerWithAddress;
  let matchMaker: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;

  async function createMatch(data: CreateMatchRequest, from: SignerWithAddress, value: BigNumberish = 0) {
    const messageBytes = createMatchBytes(data);

    const signatures = await signEach([signer1, signer2], messageBytes);

    return swapica.connect(from).createMatch(messageBytes, signatures, { value: value });
  }

  async function executeMatch(data: ExecuteMatchRequest, from: SignerWithAddress) {
    const messageBytes = executeMatchBytes(data);

    const signatures = await signEach([signer1, signer2], messageBytes);

    return swapica.connect(from).executeMatch(messageBytes, signatures);
  }

  async function cancelMatch(data: CancelMatchRequest, from: SignerWithAddress) {
    const messageBytes = cancelMatchBytes(data);

    const signatures = await signEach([signer1, signer2], messageBytes);

    return swapica.connect(from).cancelMatch(messageBytes, signatures);
  }

  async function executeOrder(data: ExecuteOrderRequest, from: SignerWithAddress) {
    const messageBytes = executeOrderBytes(data);

    const signatures = await signEach([signer1, signer2], messageBytes);

    return swapica.connect(from).executeOrder(messageBytes, signatures);
  }

  async function getOrderById(id: number): Promise<OrderStruct> {
    return orderToObject((await swapica.getAllOrders(id - 1, 1))[0]);
  }

  function orderToObject(order: OrderStructOutput): OrderStruct {
    return {
      status: {
        state: order.status.state,
        matchId: order.status.matchId,
        matchSwapica: order.status.matchSwapica,
      },
      orderId: order.orderId,
      creator: order.creator,
      tokenToSell: order.tokenToSell,
      amountToSell: order.amountToSell,
      tokenToBuy: order.tokenToBuy,
      amountToBuy: order.amountToBuy,
      destinationChain: order.destinationChain,
    };
  }

  function ordersToObject(orders: OrderStructOutput[]): OrderStruct[] {
    return orders.map((order) => orderToObject(order));
  }

  function matchToObject(match: MatchStructOutput): MatchStruct {
    return {
      state: match.state,
      matchId: match.matchId,
      originOrderId: match.originOrderId,
      creator: match.creator,
      tokenToSell: match.tokenToSell,
      amountToSell: match.amountToSell,
      originChainId: match.originChainId,
    };
  }

  function matchesToObject(matches: MatchStructOutput[]): MatchStruct[] {
    return matches.map((match) => matchToObject(match));
  }

  before(async function () {
    [owner, signer1, signer2, orderMaker, matchMaker] = await ethers.getSigners();
  });

  beforeEach(async function () {
    const Swapica = await ethers.getContractFactory("Swapica");
    swapica = await Swapica.deploy();

    await swapica.__Swapica_init([signer1.address, signer2.address]);

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    orderToken = await ERC20.deploy("OrderToken", "OT", 18);
    matchToken = await ERC20.deploy("MatchToken", "MT", 18);

    await orderToken.mint(orderMaker.address, wei(1000));
    await orderToken.connect(orderMaker).approve(swapica.address, wei(1000));

    await matchToken.mint(matchMaker.address, wei(1000));
    await matchToken.connect(matchMaker).approve(swapica.address, wei(1000));
  });

  describe("#createOrder", function () {
    const status = {
      state: State.AWAITING_MATCH,
      matchId: 0,
      matchSwapica: ZERO_ADDR,
    };

    let createOrderRequest: CreateOrderRequestStruct;

    beforeEach(async function () {
      createOrderRequest = {
        tokenToSell: orderToken.address,
        amountToSell: wei(1),
        tokenToBuy: matchToken.address,
        amountToBuy: wei(2),
        destinationChain: defaultChainId,
      };
    });

    it("should not create if ether amounts mismatch", async function () {
      createOrderRequest.tokenToSell = ETHER_ADDR;

      const tx = swapica.connect(orderMaker).createOrder(createOrderRequest);

      await expect(tx).to.be.revertedWith("Swapica: Wrong amount");
    });

    it("should create a token-token order properly if all conditions are met", async function () {
      const tx = swapica.connect(orderMaker).createOrder(createOrderRequest);

      await expect(tx).to.changeTokenBalances(orderToken, [orderMaker, swapica], [wei(-1), wei(1)]);

      await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(1, Object.values(status));
    });

    it("should create an eth-token order properly if all conditions are met", async function () {
      createOrderRequest.tokenToSell = ETHER_ADDR;

      const tx = swapica
        .connect(orderMaker)
        .createOrder(createOrderRequest, { value: createOrderRequest.amountToSell });

      await expect(tx).to.changeEtherBalances([orderMaker, swapica], [wei(-1), wei(1)]);

      await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(1, Object.values(status));

      await getOrderById(1);

      expect(await getOrderById(1)).to.be.deep.eq({
        status: status,
        orderId: 1,
        creator: orderMaker.address,
        ...createOrderRequest,
      });
    });
  });

  context("if order created", function () {
    beforeEach(async function () {
      const createOrderRequest: CreateOrderRequestStruct = {
        tokenToSell: orderToken.address,
        amountToSell: wei(1),
        tokenToBuy: matchToken.address,
        amountToBuy: wei(2),
        destinationChain: defaultChainId,
      };

      await swapica.connect(orderMaker).createOrder(createOrderRequest);
    });

    describe("#cancelOrder", function () {
      const status = {
        state: State.CANCELED,
        matchId: 0,
        matchSwapica: ZERO_ADDR,
      };

      it("should not cancel order if a caller is not the order creator", async function () {
        await expect(swapica.cancelOrder(1)).to.be.revertedWith("Swapica: You're not a creator of the order");
      });

      it("should cancel order if all conditions are met", async function () {
        const tx = swapica.connect(orderMaker).cancelOrder(1);

        await expect(tx).to.changeTokenBalances(orderToken, [orderMaker, swapica], [wei(1), wei(-1)]);

        await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(1, Object.values(status));
      });

      it("should not cancel if state is wrong", async function () {
        await swapica.connect(orderMaker).cancelOrder(1);

        await expect(swapica.connect(orderMaker).cancelOrder(1)).to.be.revertedWith("Swapica: Order status is wrong");
      });
    });

    describe("#createMatch", function () {
      let createMatchRequest: CreateMatchRequest;

      beforeEach(async function () {
        createMatchRequest = {
          selector: Selector.CREATE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          orderId: 1,
          tokenToSell: matchToken.address,
          amountToSell: wei(2),
          originChain: defaultChainId,
        };
      });

      it("should not create match if wrong selector", async function () {
        createMatchRequest.selector = Selector.CANCEL_MATCH;

        await expect(createMatch(createMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong selector");
      });

      it("should not create match if wrong chain id", async function () {
        createMatchRequest.chainId = 1337;

        await expect(createMatch(createMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong chain id");
      });

      it("should not create match if wrong swapica address", async function () {
        createMatchRequest.matchSwapica = ZERO_ADDR;

        await expect(createMatch(createMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong swapica address");
      });

      it("should create match if all conditions are met", async function () {
        const tx = createMatch(createMatchRequest, matchMaker);

        await expect(tx).to.changeTokenBalances(matchToken, [matchMaker, swapica], [wei(-2), wei(2)]);

        await expect(tx).to.emit(swapica, "MatchUpdated").withArgs(1, State.AWAITING_FINALIZATION);
      });
    });

    context("if match created", function () {
      beforeEach(async function () {
        const createMatchRequest: CreateMatchRequest = {
          selector: Selector.CREATE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          orderId: 1,
          tokenToSell: matchToken.address,
          amountToSell: wei(2),
          originChain: defaultChainId,
        };

        await createMatch(createMatchRequest, matchMaker);
      });

      describe("#cancelMatch", function () {
        let cancelMatchRequest: CancelMatchRequest;

        beforeEach(async function () {
          cancelMatchRequest = {
            selector: Selector.CANCEL_MATCH,
            chainId: defaultChainId,
            matchSwapica: swapica.address,
            matchId: 1,
          };
        });

        it("should not create match if wrong selector", async function () {
          cancelMatchRequest.selector = Selector.CREATE_MATCH;

          await expect(cancelMatch(cancelMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong selector");
        });

        it("should not create match if wrong chain id", async function () {
          cancelMatchRequest.chainId = 1337;

          await expect(cancelMatch(cancelMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong chain id");
        });

        it("should not create match if wrong swapica address", async function () {
          cancelMatchRequest.matchSwapica = ZERO_ADDR;

          await expect(cancelMatch(cancelMatchRequest, matchMaker)).to.be.revertedWith(
            "Swapica: Wrong swapica address"
          );
        });

        it("should not create match if caller is not a creator", async function () {
          await expect(cancelMatch(cancelMatchRequest, owner)).to.be.revertedWith(
            "Swapica: You're not a creator of the match"
          );
        });

        it("should cancel match properly if all conditions are met", async function () {
          const tx = cancelMatch(cancelMatchRequest, matchMaker);

          await expect(tx).to.changeTokenBalances(matchToken, [swapica, matchMaker], [wei(-2), wei(2)]);

          await expect(tx).to.emit(swapica, "MatchUpdated").withArgs(1, State.CANCELED);
        });

        it("should not cancel match if wrong state", async function () {
          await cancelMatch(cancelMatchRequest, matchMaker);

          await expect(cancelMatch(cancelMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Match state is wrong");
        });
      });

      describe("#executeMatch", function () {
        let executeMatchRequest: ExecuteMatchRequest;

        beforeEach(async function () {
          executeMatchRequest = {
            selector: Selector.EXECUTE_MATCH,
            chainId: defaultChainId,
            matchSwapica: swapica.address,
            matchId: 1,
            receiver: orderMaker.address,
          };
        });

        it("should not execute match if wrong selector", async function () {
          executeMatchRequest.selector = Selector.EXECUTE_ORDER;

          await expect(executeMatch(executeMatchRequest, orderMaker)).to.be.revertedWith("Swapica: Wrong selector");
        });

        it("should not execute match if wrong state", async function () {
          await executeMatch(executeMatchRequest, orderMaker);

          await expect(executeMatch(executeMatchRequest, orderMaker)).to.be.revertedWith(
            "Swapica: Match status is wrong"
          );
        });

        it("should not execute match if wrong chain id", async function () {
          executeMatchRequest.chainId = 1337;

          await expect(executeMatch(executeMatchRequest, orderMaker)).to.be.revertedWith("Swapica: Wrong chain id");
        });

        it("should not execute match if wrong swapica address", async function () {
          executeMatchRequest.matchSwapica = ZERO_ADDR;

          await expect(executeMatch(executeMatchRequest, orderMaker)).to.be.revertedWith(
            "Swapica: Wrong swapica address"
          );
        });

        it("should execute match properly if all conditions are met", async function () {
          const tx = executeMatch(executeMatchRequest, orderMaker);

          await expect(tx).to.changeTokenBalances(matchToken, [orderMaker, swapica], [wei(2), wei(-2)]);

          await expect(tx).to.emit(swapica, "MatchUpdated").withArgs(1, State.EXECUTED);
        });
      });

      describe("#executeOrder", function () {
        let executeOrderRequest: ExecuteOrderRequest;

        beforeEach(async function () {
          executeOrderRequest = {
            selector: Selector.EXECUTE_ORDER,
            chainId: defaultChainId,
            orderSwapica: swapica.address,
            orderId: 1,
            receiver: matchMaker.address,
            matchSwapica: swapica.address,
            matchId: 1,
          };
        });

        it("should not execute order if wrong selector", async function () {
          executeOrderRequest.selector = Selector.EXECUTE_MATCH;

          await expect(executeOrder(executeOrderRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong selector");
        });

        it("should not execute order if wrong state", async function () {
          await executeOrder(executeOrderRequest, matchMaker);

          await expect(executeOrder(executeOrderRequest, matchMaker)).to.be.revertedWith(
            "Swapica: Order status is wrong"
          );
        });

        it("should not execute match if wrong chain id", async function () {
          executeOrderRequest.chainId = 1337;

          await expect(executeOrder(executeOrderRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong chain id");
        });

        it("should not execute order if wrong swapica address", async function () {
          executeOrderRequest.orderSwapica = ZERO_ADDR;

          await expect(executeOrder(executeOrderRequest, matchMaker)).to.be.revertedWith(
            "Swapica: Wrong swapica address"
          );
        });

        it("should execute order properly if all conditions are met", async function () {
          const tx = executeOrder(executeOrderRequest, matchMaker);

          await expect(tx).to.changeTokenBalances(orderToken, [matchMaker, swapica], [wei(1), wei(-1)]);

          await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(1, [State.EXECUTED, 1, swapica.address]);
        });
      });
    });
  });

  context("if multiple orders and matches", function () {
    let createOrderRequests: CreateOrderRequestStruct[];
    let createMatchRequests: CreateMatchRequest[];

    let orders: OrderStruct[];
    let matches: MatchStruct[];

    beforeEach(async function () {
      createOrderRequests = [
        {
          tokenToSell: orderToken.address,
          amountToSell: wei(1),
          tokenToBuy: matchToken.address,
          amountToBuy: wei(2),
          destinationChain: defaultChainId,
        },
        {
          tokenToSell: ETHER_ADDR,
          amountToSell: wei(3),
          tokenToBuy: matchToken.address,
          amountToBuy: wei(4),
          destinationChain: defaultChainId,
        },
        {
          tokenToSell: orderToken.address,
          amountToSell: wei(5),
          tokenToBuy: ETHER_ADDR,
          amountToBuy: wei(6),
          destinationChain: defaultChainId,
        },
      ];

      createMatchRequests = [
        {
          selector: Selector.CREATE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          orderId: 1,
          tokenToSell: matchToken.address,
          amountToSell: wei(2),
          originChain: defaultChainId,
        },
        {
          selector: Selector.CREATE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          orderId: 3,
          tokenToSell: ETHER_ADDR,
          amountToSell: wei(6),
          originChain: defaultChainId,
        },
      ];

      for (const request of createOrderRequests) {
        await swapica.connect(orderMaker).createOrder(request, { value: request.amountToSell });
      }

      for (const request of createMatchRequests) {
        await createMatch(request, matchMaker, request.amountToSell);
      }

      await swapica.connect(orderMaker).cancelOrder(2);

      await executeOrder(
        {
          selector: Selector.EXECUTE_ORDER,
          chainId: defaultChainId,
          orderSwapica: swapica.address,
          orderId: 1,
          receiver: matchMaker.address,
          matchSwapica: swapica.address,
          matchId: 1,
        },
        matchMaker
      );

      await executeMatch(
        {
          selector: Selector.EXECUTE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          matchId: 1,
          receiver: orderMaker.address,
        },
        orderMaker
      );

      orders = [
        {
          status: {
            state: State.EXECUTED,
            matchId: 1,
            matchSwapica: swapica.address,
          },
          orderId: 1,
          creator: orderMaker.address,
          ...createOrderRequests[0],
        },
        {
          status: {
            state: State.CANCELED,
            matchId: 0,
            matchSwapica: ZERO_ADDR,
          },
          orderId: 2,
          creator: orderMaker.address,
          ...createOrderRequests[1],
        },
        {
          status: {
            state: State.AWAITING_MATCH,
            matchId: 0,
            matchSwapica: ZERO_ADDR,
          },
          orderId: 3,
          creator: orderMaker.address,
          ...createOrderRequests[2],
        },
      ];

      matches = [
        {
          state: State.EXECUTED,
          matchId: 1,
          originChainId: defaultChainId,
          creator: matchMaker.address,
          tokenToSell: matchToken.address,
          amountToSell: wei(2),
          originOrderId: 1,
        },
        {
          state: State.AWAITING_FINALIZATION,
          matchId: 2,
          originChainId: defaultChainId,
          creator: matchMaker.address,
          tokenToSell: ETHER_ADDR,
          amountToSell: wei(6),
          originOrderId: 3,
        },
      ];
    });

    describe("#getUserOrders", function () {
      it("should return whole range properly", async function () {
        expect(ordersToObject(await swapica.getUserOrders(matchMaker.address, 0, 10))).to.be.deep.eq([]);
        expect(ordersToObject(await swapica.getUserOrders(orderMaker.address, 0, 10))).to.be.deep.eq(orders);
      });

      it("should return part properly", async function () {
        expect(ordersToObject(await swapica.getUserOrders(orderMaker.address, 0, 1))).to.be.deep.eq(orders.slice(0, 1));
        expect(ordersToObject(await swapica.getUserOrders(orderMaker.address, 1, 2))).to.be.deep.eq(orders.slice(1, 3));
        expect(ordersToObject(await swapica.getUserOrders(orderMaker.address, 3, 1))).to.be.deep.eq([]);
      });
    });

    describe("#getUserMatches", function () {
      it("should return whole range properly", async function () {
        expect(matchesToObject(await swapica.getUserMatches(orderMaker.address, 0, 10))).to.be.deep.eq([]);
        expect(matchesToObject(await swapica.getUserMatches(matchMaker.address, 0, 10))).to.be.deep.eq(matches);
      });

      it("should return part properly", async function () {
        expect(matchesToObject(await swapica.getUserMatches(matchMaker.address, 0, 1))).to.be.deep.eq(
          matches.slice(0, 1)
        );
        expect(matchesToObject(await swapica.getUserMatches(matchMaker.address, 1, 1))).to.be.deep.eq(
          matches.slice(1, 2)
        );
        expect(matchesToObject(await swapica.getUserMatches(matchMaker.address, 2, 1))).to.be.deep.eq([]);
      });
    });

    describe("#getAllOrders", function () {
      it("should return whole range properly", async function () {
        expect(ordersToObject(await swapica.getAllOrders(0, 10))).to.be.deep.eq(orders);
      });

      it("should return part properly", async function () {
        expect(ordersToObject(await swapica.getAllOrders(0, 1))).to.be.deep.eq(orders.slice(0, 1));
        expect(ordersToObject(await swapica.getAllOrders(1, 1))).to.be.deep.eq(orders.slice(1, 2));
        expect(ordersToObject(await swapica.getAllOrders(1, 2))).to.be.deep.eq(orders.slice(1, 3));
        expect(ordersToObject(await swapica.getAllOrders(3, 2))).to.be.deep.eq([]);
      });
    });
  });
});
