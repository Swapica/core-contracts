const { excpect } = require("chai");
const hardhat = require("hardhat");
const Reverter = require("./helpers/reverter.js");
const { BigNumber } = require("bignumber.js");

const Book = artifacts.require("Swapica");
const Token = artifacts.require("ERC20Mock");

const executeOrderSelector = 0;
const executeMatchSelector = 1;
const createMatchSelector = 2;
const cancelMatchSelector = 3;

const State = {
  NONE: 0,
  AWAITING_MATCH: 1,
  AWAITING_FINALIZATION: 2,
  CANCELED: 3,
  EXECUTED: 4,
};

describe("CrossBook", function () {
  let orderBook;
  let matchBook;
  let realToken;
  let testToken;
  let accounts;

  const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const reverter = new Reverter();
  const TOTAL = 100_000;
  const AMOUNT = 123;
  const AMOUNT2 = 12;
  const NETWORK = 31337;

  before("Deployment", async function () {
    accounts = await web3.eth.getAccounts();
    orderBook = await Book.new();
    await orderBook.__Swapica_init([accounts[0]]);
    matchBook = await Book.new();
    await matchBook.__Swapica_init([accounts[0]]);

    realToken = await Token.new("RealToken", "RTKN", 27);
    testToken = await Token.new("TestToken", "TTKN", 27);
    await realToken.mint(accounts[0], TOTAL);
    await realToken.increaseAllowance(orderBook.address, TOTAL);
    await testToken.mint(accounts[0], TOTAL);
    await testToken.increaseAllowance(matchBook.address, TOTAL);

    await realToken.mint(accounts[1], TOTAL);
    await realToken.increaseAllowance(orderBook.address, TOTAL, { from: accounts[1] });
    await testToken.mint(accounts[1], TOTAL);
    await testToken.increaseAllowance(matchBook.address, TOTAL, { from: accounts[1] });

    await realToken.mint(accounts[2], TOTAL);
    await realToken.increaseAllowance(realToken.address, TOTAL, { from: accounts[2] });
    await testToken.mint(accounts[2], TOTAL);
    await testToken.increaseAllowance(matchBook.address, TOTAL, { from: accounts[2] });
    await reverter.snapshot();
  });
  afterEach("revert", reverter.revert);
  describe("createOrder", function () {
    it("should create order", async function () {
      let tx;
      tx = await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK);
      expect(tx).to.emit(orderBook, "OrderCreated").withArgs(0);
      expect((await orderBook.orderStatus(0)).state).to.equal(1);
      expect((await orderBook.orders(0)).id).to.equal(0);
      expect(await orderBook.locked(accounts[0], realToken.address)).to.equal(AMOUNT);
      expect((await orderBook.orderStatus(1)).state).to.equal(0);

      tx = await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK);
      expect(tx).to.emit(orderBook, "OrderCreated").withArgs(1);
      expect((await orderBook.orderStatus(1)).state).to.equal(1);
      expect((await orderBook.orders(1)).id).to.equal(1);
      expect(await orderBook.locked(accounts[0], realToken.address)).to.equal(AMOUNT * 2);
    });
  });
  describe("cancel", function () {
    it("should cancel order", async function () {
      tx = await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK);
      expect(await realToken.balanceOf(accounts[0])).to.equal(TOTAL - AMOUNT);
      await orderBook.cancelOrder(0);
      expect(await realToken.balanceOf(accounts[0])).to.equal(TOTAL);
      const s = await orderBook.orderStatus(0);
      expect(s.state).to.equal(3);
    });
    it("should cancel match", async function () {
      await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK);
      await createMatch(matchBook, 31337, 0, testToken.address, AMOUNT2, NETWORK, { from: accounts[2] });
      await cancelMatch(matchBook, 31337, 0, { from: accounts[2] });
      expect(await testToken.balanceOf(accounts[2])).to.equal(TOTAL);
      const s = await matchBook.matchStatus(0);
      expect(s.state).to.equal(3);
    });
  });
  describe("successful scenarios", function () {
    it("erc20 scenario", async function () {
      await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK, {
        from: accounts[1],
      });

      await createMatch(matchBook, 31337, 0, testToken.address, AMOUNT2, NETWORK, { from: accounts[2] });

      await executeOrder(orderBook, 31337, 0, (await matchBook.matches(0)).account, matchBook.address, 0);
      expect(await realToken.balanceOf(accounts[1])).to.equal(TOTAL - AMOUNT);
      expect(await realToken.balanceOf(accounts[2])).to.equal(TOTAL + AMOUNT);
      expect(await testToken.balanceOf(accounts[1])).to.equal(TOTAL);
      expect(await testToken.balanceOf(accounts[2])).to.equal(TOTAL - AMOUNT2);

      await executeMatch(matchBook, 31337, 0, (await orderBook.orders(0)).account);

      expect(await realToken.balanceOf(accounts[1])).to.equal(TOTAL - AMOUNT);
      expect(await testToken.balanceOf(accounts[1])).to.equal(TOTAL + AMOUNT2);
      expect(await realToken.balanceOf(accounts[2])).to.equal(TOTAL + AMOUNT);
      expect(await testToken.balanceOf(accounts[2])).to.equal(TOTAL - AMOUNT2);
    });
    it("native coin scenario", async function () {
      await orderBook.createOrder(NATIVE, AMOUNT, NATIVE, AMOUNT2, NETWORK, { from: accounts[1], value: AMOUNT });

      await createMatch(matchBook, 31337, 0, NATIVE, AMOUNT2, NETWORK, {
        from: accounts[2],
        value: AMOUNT2,
      });

      const before1 = await web3.eth.getBalance(accounts[2]);
      await executeOrder(orderBook, 31337, 0, (await matchBook.matches(0)).account, matchBook.address, 0);
      const after1 = new BigNumber(await web3.eth.getBalance(accounts[2]));
      expect(after1.minus(before1)).to.be.equal(AMOUNT);

      const before2 = await web3.eth.getBalance(accounts[1]);
      await executeMatch(matchBook, 31337, 0, (await orderBook.orders(0)).account);
      const after2 = new BigNumber(await web3.eth.getBalance(accounts[1]));
      expect(after2.minus(before2)).to.be.equal(AMOUNT2);
    });
    it("erc20 scenario + signers functionality", async function () {
      expect(await orderBook.getSigners()).to.deep.equal([accounts[0]]);
      await orderBook.addSigners([accounts[1], accounts[2]]);
      expect(await orderBook.getSigners()).to.deep.equal([accounts[0], accounts[1], accounts[2]]);
      expect(await orderBook.removeSigners([accounts[0]]));
      expect(await orderBook.getSigners()).to.deep.equal([accounts[2], accounts[1]]);
      await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK, {
        from: accounts[1],
      });

      await createMatch(matchBook, 31337, 0, testToken.address, AMOUNT2, NETWORK, { from: accounts[2] });

      await executeOrder(orderBook, 31337, 0, (await matchBook.matches(0)).account, matchBook.address, 0);
      expect(await realToken.balanceOf(accounts[2])).to.equal(TOTAL + AMOUNT);

      await executeMatch(matchBook, 31337, 0, (await orderBook.orders(0)).account);
      expect(await testToken.balanceOf(accounts[1])).to.equal(TOTAL + AMOUNT2);
    });
  });
  describe("view functions", function () {
    it("order len", async function () {
      await create(1);
      expect(await orderBook.getOrdersLength()).to.be.equal(1);
      expect(await matchBook.getMatchesLength()).to.be.equal(0);
      expect(await matchBook.getUserMatchesLength(accounts[0])).to.be.equal(0);

      await create(6);
      expect(await orderBook.getOrdersLength()).to.be.equal(2);
      expect(await matchBook.getMatchesLength()).to.be.equal(1);
      expect(await orderBook.getUserOrdersLength(accounts[0])).to.be.equal(2);
      expect(await matchBook.getUserMatchesLength(accounts[0])).to.be.equal(1);

      await create(2);
      expect(await orderBook.getOrdersLength()).to.be.equal(3);
      expect(await matchBook.getMatchesLength()).to.be.equal(2);
      expect(await orderBook.getUserOrdersLength(accounts[0])).to.be.equal(3);
      expect(await matchBook.getUserMatchesLength(accounts[0])).to.be.equal(2);

      await create(2, accounts[1]);
      expect(await orderBook.getOrdersLength()).to.be.equal(4);
      expect(await matchBook.getMatchesLength()).to.be.equal(3);
      expect(await orderBook.getUserOrdersLength(accounts[1])).to.be.equal(1);
      expect(await matchBook.getUserMatchesLength(accounts[1])).to.be.equal(1);
    });
    it("get active orders", async function () {
      let orders;
      orders = await orderBook.getActiveOrders(realToken.address, testToken.address, 0, 100);
      expect(orders).to.deep.equal([]);
      await create(1);
      orders = await orderBook.getActiveOrders(realToken.address, testToken.address, 0, 100);
      expect(orders.length).to.be.equal(1);
      expect(orders[0].id).to.be.equal("0");
      await create(4);
      orders = await orderBook.getActiveOrders(realToken.address, testToken.address, 0, 100);
      expect(orders.length).to.be.equal(1);
      await create(5);
      orders = await orderBook.getActiveOrders(realToken.address, testToken.address, 0, 100);
      expect(orders.length).to.be.equal(1);
      await create(6);
      orders = await orderBook.getActiveOrders(realToken.address, testToken.address, 0, 100);
      expect(orders.length).to.be.equal(2);
      expect(orders[1].id).to.be.equal("3");
    });
    it("get order's status", async function () {
      let state;

      await create(2);
      state = (await orderBook.orderStatus(0)).state;
      expect(state).to.be.equal(State.AWAITING_MATCH);
      state = (await matchBook.matchStatus(0)).state;
      expect(state).to.be.equal(State.AWAITING_FINALIZATION);

      await create(3);
      state = (await orderBook.orderStatus(1)).state;
      expect(state).to.be.equal(State.EXECUTED);
      state = (await matchBook.matchStatus(1)).state;
      expect(state).to.be.equal(State.AWAITING_FINALIZATION);

      await create(4);
      state = (await orderBook.orderStatus(2)).state;
      expect(state).to.be.equal(State.EXECUTED);
      state = (await matchBook.matchStatus(2)).state;
      expect(state).to.be.equal(State.EXECUTED);

      await create(6);
      state = (await orderBook.orderStatus(3)).state;
      expect(state).to.be.equal(State.AWAITING_MATCH);
      state = (await matchBook.matchStatus(3)).state;
      expect(state).to.be.equal(State.CANCELED);

      await create(1);
      state = (await orderBook.orderStatus(4)).state;
      expect(state).to.be.equal(State.AWAITING_MATCH);
      await create(5);
      state = (await orderBook.orderStatus(5)).state;
      expect(state).to.be.equal(State.CANCELED);
    });
    it("user's orders and matches", async function () {
      let info;
      info = await orderBook.getUserOrders(accounts[0], State.NONE, 0, 100);
      expect(info.length).to.be.equal(await orderBook.getUserOrdersLength(accounts[0]));
      info = await matchBook.getUserMatches(accounts[0], State.NONE, 0, 100);
      expect(info.length).to.be.equal(await matchBook.getUserMatchesLength(accounts[0]));

      await create(4);
      info = await orderBook.getUserOrders(accounts[0], State.NONE, 0, 100);
      expect(info.length).to.be.equal(await orderBook.getUserOrdersLength(accounts[0]));
      expect(info.at(-1).account).to.be.equal(accounts[0]);
      expect(info.at(-1).id).to.be.equal("0");
      info = await matchBook.getUserMatches(accounts[0], State.NONE, 0, 100);
      expect(info.length).to.be.equal(1);
      expect(info.at(-1).account).to.be.equal(accounts[0]);
      expect(info.at(-1).id).to.be.equal("0");
      info = await orderBook.getUserOrders(accounts[0], State.CANCELED, 0, 100);
      expect(info.length).to.be.equal(0);
      info = await matchBook.getUserMatches(accounts[0], State.CANCELED, 0, 100);
      expect(info.length).to.be.equal(0);

      await create(5);
      info = await orderBook.getUserOrders(accounts[0], State.CANCELED, 0, 100);
      expect(info.length).to.be.equal(1);
      expect(info.at(-1).account).to.be.equal(accounts[0]);
      expect(info.at(-1).id).to.be.equal("1");

      await create(1);
      info = await orderBook.getUserOrders(accounts[0], State.NONE, 0, 100);
      expect(info.length).to.be.equal(3);
      expect(info.at(-1).id).to.be.equal("2");

      info = await orderBook.getUserOrders(accounts[0], State.AWAITING_MATCH, 0, 100);
      expect(info.length).to.be.equal(1);
      expect(info.at(-1).id).to.be.equal("2");
    });
    it("locked", async function () {
      await create(2);
      expect(await orderBook.locked(accounts[0], realToken.address)).to.be.equal(AMOUNT);
      expect(await matchBook.locked(accounts[0], testToken.address)).to.be.equal(AMOUNT2);
    });
  });
  async function create(type, from = accounts[0]) {
    ///  0 - none
    ///  1 - waiting mathcing
    ///  2 - waiting order execution
    ///  3 - waiting match execution
    ///  4 - executed
    ///  5 - cancelled order
    ///  6 - cancelled match
    let tx;
    let orderId = 0;
    let matchId = 0;

    if (type >= 1) {
      tx = await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK, { from });
      orderId = tx.receipt.logs.find((_) => _.event == "OrderUpdated").args.id;
    }
    if (type == 5) {
      await orderBook.cancelOrder(orderId, { from });
      return;
    }
    if (type >= 2) {
      tx = await createMatch(matchBook, 31337, orderId, testToken.address, AMOUNT2, NETWORK, { from });
      matchId = tx.receipt.logs.find((_) => _.event == "MatchUpdated").args.id;
    }
    if (type == 6) {
      await cancelMatch(matchBook, 31337, matchId, { from });
      return;
    }
    if (type >= 3) {
      await executeOrder(orderBook, 31337, orderId, from, matchBook.address, matchId);
    }
    if (type >= 4) {
      await executeMatch(matchBook, 31337, matchId, (await orderBook.orders(0)).account);
    }
    return [orderId, matchId];
  }
});

async function createMatch(book, chainid, orderId, tokenToSell, amountToSell, ordiginChainId, txOpts = {}) {
  const data = web3.eth.abi.encodeParameters(
    ["uint256", "uint", "address", "uint", "address", "uint", "uint"],
    [createMatchSelector, chainid, book.address, orderId, tokenToSell, amountToSell, ordiginChainId]
  );
  const signers = await book.getSigners();
  const signatures = await Promise.all(signers.map((s) => web3.eth.sign(web3.utils.keccak256(data), s)));
  return await book.createMatch(data, signatures, txOpts);
}

async function executeMatch(book, chainid, matchId, receiver) {
  const data = web3.eth.abi.encodeParameters(
    ["uint256", "uint", "address", "uint", "address"],
    [executeMatchSelector, chainid, book.address, matchId, receiver]
  );
  const signers = await book.getSigners();
  const signatures = await Promise.all(signers.map((s) => web3.eth.sign(web3.utils.keccak256(data), s)));
  return await book.executeMatch(data, signatures);
}

async function cancelMatch(book, chainid, matchId, txOpts = {}) {
  const data = web3.eth.abi.encodeParameters(
    ["uint256", "uint", "address", "uint"],
    [cancelMatchSelector, chainid, book.address, matchId]
  );
  const signers = await book.getSigners();
  const signatures = await Promise.all(signers.map((s) => web3.eth.sign(web3.utils.keccak256(data), s)));
  return await book.cancelMatch(data, signatures, txOpts);
}

async function executeOrder(book, chainid, orderId, receiver, matchBookAddress, matchId) {
  const data = web3.eth.abi.encodeParameters(
    ["uint256", "uint", "address", "uint", "address", "address", "uint"],
    [executeOrderSelector, chainid, book.address, orderId, receiver, matchBookAddress, matchId]
  );
  const signers = await book.getSigners();
  const signatures = await Promise.all(signers.map((s) => web3.eth.sign(web3.utils.keccak256(data), s)));
  return await book.executeOrder(data, signatures);
}
