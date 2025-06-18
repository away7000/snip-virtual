const prompt = require('select-prompt')
const WebSocket = require("ws");
const { ethers, parseEther } = require("ethers");
const { fetchSubgraphData } = require("./graph");
const { getCountdown } = require("./lib");
const factoryAbi = require("./abis/Factory.json")
const genesisAbi = require("./abis/Genesis.json")
const routerAbi = require("./abis/UniswapV2Router.json")
const virtualTokenAbi = require("./abis/VirtualToken.json")
const dotenv = require("dotenv");
dotenv.config();


if (!process.env.PRIVATE_KEY) {
    throw new Error("Please set your PRIVATE_KEY in the .env file");
}
const providerUrl = "wss://0xrpc.io/base";
const rpcProvider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, rpcProvider);

let provider;
let wsClient;
let dontConnect = false
const virtualTokenAddressToBuyAgentToken = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b"
const UniswapV2Router = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24"
let amaountToBuy = "0.1" //virtual token
const virtualTokenContract = new ethers.Contract(virtualTokenAddressToBuyAgentToken, virtualTokenAbi, signer);
const router = new ethers.Contract(UniswapV2Router, routerAbi, signer);


async function connect(data) {
    console.log(`\n\nTarget`)
    console.log(`ticker: ${data.ticker}`);
    console.log(`genesis_address: ${data.contractAddress}`);
    console.log(`id: ${data.id}`);
    console.log(`status: ${data.status}`);
    console.log(`${getCountdown(data.endTime)}\n`);
    console.log("Connecting to provider...");
    wsClient = new WebSocket(providerUrl);
    wsClient.on('open', () => {
        console.log("WebSocket connection established");
    });
    wsClient.on('close', () => {
        if (!dontConnect) {
            console.error("WebSocket connection closed. Reconnecting...");
            reconnect()
        }
    });
    wsClient.on('error', (error) => {
        if (!dontConnect) {
            console.error("WebSocket error:", error);
            reconnect()
        }
    });
    provider = new ethers.WebSocketProvider(wsClient);
    provider.on("network", (newNetwork, oldNetwork) => {
        if (oldNetwork) {
            if (!dontConnect) {
                console.error("Network connection lost. Reconnecting...");
                reconnect()
            }
        }
    });
    listenForEvents(data);
}

function reconnect() {
    console.log("Attempting to reconnect in 1 seconds...");
    setTimeout(connect, 1000);
}



const factoryInterface = new ethers.Interface(factoryAbi);
const genesisInterface = new ethers.Interface(genesisAbi);
let intervalId

function listenForEvents(data) {
    console.log(`Listening for events...`);
    provider.on({ address: data.contractAddress }, (log) => {
        handleGenesisLogs(log)
    })
    intervalId = setInterval(() => {
        console.log(getCountdown(data.endTime))
    }, 1000);
}
async function handleBuyTokenfromUniswapV2Pair(token, lp) {
    console.log("buying token")
    console.log("token", token)
    console.log("lp", lp)
    try {
        const amountIn = ethers.parseEther(amaountToBuy);
        const amountOutMin = await router.getAmountsOut(amountIn, [virtualTokenAddressToBuyAgentToken, token]);
        console.log("amountOutMin", amountOutMin[1]);
        const buy = await router.swapExactTokensForTokens(
            amountIn,
            amountOutMin[1],
            [virtualTokenAddressToBuyAgentToken, token],
            signer.address,
            Math.floor(Date.now() / 1000) + 60 * 20, // deadline 20 minutes
            { gasLimit: 500000 }
        );
        const receipt = await buy.wait();
        console.log("Receipt:", receipt);
        console.log("✅ Buy hash:", buy.hash);
        clearInterval(intervalId);
        dontConnect = true;
        provider.removeAllListeners();
        wsClient.close();
    } catch (error) {
        console.log("handleBuyTokenfromUniswapV2Pair", error);
        handleBuyTokenfromUniswapV2Pair(token, lp)
        return;
    }

}
async function decodeFactoryLogs(txHash) {
    const receipt = await rpcProvider.getTransactionReceipt(txHash);
    for (const log of receipt.logs) {
        try {
            const parsed = factoryInterface.parseLog(log)
            if (parsed.name === "NewPersona") {
                console.log("Factory Event:", parsed.name);
                console.log(`virtualId: ${parsed.args[0]}`)
                console.log(`token: ${parsed.args[1]}`)
                console.log(`dao: ${parsed.args[2]}`)
                console.log(`tba: ${parsed.args[3]}`)
                console.log(`veToken: ${parsed.args[4]}`)
                console.log(`lp: ${parsed.args[5]}`)
                handleBuyTokenfromUniswapV2Pair(parsed.args[1], parsed.args[5])
            }
            continue;
        } catch (err) {
            console.log("decodeFactoryLogs error", err)
        }
    }
}
function handleGenesisLogs(event) {
    try {
        const parsed = genesisInterface.parseLog(event);
        switch (parsed.name) {
            case "Participated":
                console.log(`\nNew Participations: ${parsed.args[1]}`);
                console.log(`Point: ${parsed.args[2]}`);
                console.log(`Virtuals: ${parsed.args[3]}`);
                break;
            case "GenesisSucceeded":
                decodeFactoryLogs(event.transactionHash)
                break;
            case "GenesisFailed":
                console.log("Project Failed, script stoping..")
                clearInterval(intervalId);
                dontConnect = true;
                provider.removeAllListeners();
                wsClient.close();
                break;
            default:
                break;
        }
    } catch (err) {
        console.log("error", err)
    }
}

async function checkApproval() {
    const allowance = await virtualTokenContract.allowance(signer.address, UniswapV2Router);
    return parseFloat(allowance)
}

async function Approve() {
    console.log("Approving Uniswap Router to spend Virtual Token...");
    const approveTx = await virtualTokenContract.approve(UniswapV2Router, ethers.MaxUint256);
    await approveTx.wait();
    console.log("Approval successful");
}
function confirm(Approval, data) {
    if (Approval < parseEther(amaountToBuy)) {
        prompt('Approve token virtual dulu ke contract uniswap router?', [
            { title: 'Yes', value: true },
            { title: 'No', value: false }
        ])
            .on('abort', (y) => console.log('Aborted with', y))
            .on('submit', async (y) => {
                if (y) {
                    await Approve()
                }
                connect(data)
            })
    } else {
        connect(data)
    }
}
async function main() {
    try {
        const Approval = await checkApproval()
        const { factoryGeneses } = await fetchSubgraphData()
        const choices = factoryGeneses.map((genesis, i) => ({
            title: `${genesis.ticker} - ${genesis.contractAddress} - ${getCountdown(genesis.endTime)}`,
            value: genesis
        }));
        prompt('Pilih Target', choices)
            .on('submit', (v) => confirm(Approval, v))

    } catch (error) {
        console.log(error.message)
    }
}

main()