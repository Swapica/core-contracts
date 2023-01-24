// Include following line to get access to the ERC1967Proxy artifact.
// import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const Swapica = artifacts.require("Swapica");

const signers = ["0xA2159b461D35E2c2faA5A561dE051ba8CCC1B9e7"];
const newOwner = "0x53638975BC11de3029E46DF193d64879EAeA94eB";

module.exports = async (deployer, logger) => {
  const swapica = await deployer.deploy(Swapica);
  const proxyS = await deployer.deploy(ERC1967Proxy, swapica.address, "0x");

  logger.logTransaction(await (await Swapica.at(proxyS.address)).__Swapica_init(signers), "Initialize Swapica");

  logger.logTransaction(await (await Swapica.at(proxyS.address)).transferOwnership(newOwner), "Transfer Ownership");

  logger.logContracts(["Swapica implementation", swapica.address], ["Swapica proxy", proxyS.address]);
};
