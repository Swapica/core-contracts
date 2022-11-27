const { excpect } = require("chai");
const hardhat = require("hardhat");
const Reverter = require("./helpers/reverter.js");
const Book = artifacts.require("Swapica");
const Token = artifacts.require("ERC20Mock");

describe("CrossBook", function () {
  let orderBook;
  let matchBook;
  let realToken;
  let testToken;
  let accounts;
  const reverter = new Reverter();
  const TOTAL = 100_000;
  const AMOUNT = 123;
  const AMOUNT2 = 12;
  const NETWORK = 1;

  const createMatchSelector = "0xf7662788";
  const executeOrderSelector = "0x14d41b45";
  const finializeMatchSelector = "0x7bf99e87";

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
      expect(await orderBook.orderStatus(0)).to.equal(1);
      expect((await orderBook.orders(0)).id).to.equal(0);
      expect(await orderBook.locked(accounts[0], realToken.address)).to.equal(AMOUNT);
      expect(await orderBook.orderStatus(1)).to.equal(0);

      tx = await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK);
      expect(tx).to.emit(orderBook, "OrderCreated").withArgs(1);
      expect(await orderBook.orderStatus(1)).to.equal(1);
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
    });
  });
  it("scenario", async function () {
    await orderBook.createOrder(realToken.address, AMOUNT, testToken.address, AMOUNT2, NETWORK, { from: accounts[1] });

    const matchData = web3.eth.abi.encodeParameters(
      ["bytes4", "uint", "address", "uint", "address", "uint", "uint"],
      [createMatchSelector, 31337, matchBook.address, 0, testToken.address, AMOUNT2, NETWORK]
    );
    await matchBook.createMatch(matchData, [await web3.eth.sign(web3.utils.keccak256(matchData), accounts[0])], {
      from: accounts[2],
    });

    const executeData = web3.eth.abi.encodeParameters(
      ["bytes4", "uint", "address", "uint", "address"],
      [executeOrderSelector, 31337, orderBook.address, 0, (await matchBook.matches(0)).account]
    );
    await orderBook.executeOrder(executeData, [await web3.eth.sign(web3.utils.keccak256(executeData), accounts[0])]);
    expect(await realToken.balanceOf(accounts[1])).to.equal(TOTAL - AMOUNT);
    expect(await realToken.balanceOf(accounts[2])).to.equal(AMOUNT);
    expect(await testToken.balanceOf(accounts[1])).to.equal(0);
    expect(await testToken.balanceOf(accounts[2])).to.equal(TOTAL - AMOUNT2);

    const finilizeData = web3.eth.abi.encodeParameters(
      ["bytes4", "uint", "address", "uint", "address"],
      [finializeMatchSelector, 31337, matchBook.address, 0, (await orderBook.orders(0)).account]
    );
    await matchBook.finializeMatch(finilizeData, [
      await web3.eth.sign(web3.utils.keccak256(finilizeData), accounts[0]),
    ]);

    expect(await realToken.balanceOf(accounts[1])).to.equal(TOTAL - AMOUNT);
    expect(await testToken.balanceOf(accounts[1])).to.equal(AMOUNT2);
    expect(await realToken.balanceOf(accounts[2])).to.equal(AMOUNT);
    expect(await testToken.balanceOf(accounts[2])).to.equal(TOTAL - AMOUNT2);
  });
});
