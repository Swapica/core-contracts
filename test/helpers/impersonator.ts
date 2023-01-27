import { network } from "hardhat";

const impersonate = async (address: any) => {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });

  await network.provider.send("hardhat_setBalance", [address, "0xFFFFFFFFFFFFFFFF"]);
};

export { impersonate };
