// Include following line to get access to the ERC1967Proxy artifact.
// import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const Swapica = artifacts.require("Swapica");

// TODO: change signer addresses
const signers = ["0xE461aa915538B81BA17995DF5FEDB96640f10BDE"];

module.exports = async (deployer, logger) => {
  const swapica = await deployer.deploy(Swapica);
  const proxyS = await deployer.deploy(ERC1967Proxy, swapica.address, "0x");

  logger.logTransaction(await (await Swapica.at(proxyS.address)).__Swapica_init(signers), "Initialize Swapica");

  logger.logContracts(["Swapica implementation", swapica.address], ["Swapica proxy", proxyS.address]);
};
