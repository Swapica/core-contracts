const ERC20 = artifacts.require("ERC20Mock");

const { logTransaction, logContracts } = require("@dlsl/hardhat-migrate");

// TODO: change debug addresses
const addrr1 = '0xf41ceE234219D6cc3d90A6996dC3276aD378cfCF';
const addrr2 = '0xE461aa915538B81BA17995DF5FEDB96640f10BDE';

module.exports = async (deployer) => {
  const token1 = await deployer.deploy(ERC20, "Token1", "SWT1", 18);
  const token2 = await deployer.deploy(ERC20, "Token1", "SWT1", 18);

  logTransaction(await token1.mint(addrr1, 100000000), "Mint 1 for 1")
  logTransaction(await token2.mint(addrr1, 100000000), "Mint 2 for 1")

  logTransaction(await token1.mint(addrr2, 100000000), "Mint 1 for 2")
  logTransaction(await token2.mint(addrr2, 100000000), "Mint 2 for 2")

  logContracts(["Token1", token1.address], ["Token2", token2.address]);
};
