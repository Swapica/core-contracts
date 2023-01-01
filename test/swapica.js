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
  const NETWORK = 1;

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

    await realToken.mint(accounts[1], TOTAL);
    await realToken.increaseAllowance(orderBook.address, TOTAL, { from: accounts[1] });

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
      expect(await realToken.balanceOf(accounts[2])).to.equal(AMOUNT);
      expect(await testToken.balanceOf(accounts[1])).to.equal(0);
      expect(await testToken.balanceOf(accounts[2])).to.equal(TOTAL - AMOUNT2);

      await executeMatch(matchBook, 31337, 0, (await orderBook.orders(0)).account);

      expect(await realToken.balanceOf(accounts[1])).to.equal(TOTAL - AMOUNT);
      expect(await testToken.balanceOf(accounts[1])).to.equal(AMOUNT2);
      expect(await realToken.balanceOf(accounts[2])).to.equal(AMOUNT);
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
  });
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
