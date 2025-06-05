import express, { Request, Response, RequestHandler } from 'express';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync } from 'fs';
import { EndpointId } from '@layerzerolabs/lz-definitions';
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat';
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities';
import { generateConnectionsConfig } from '@layerzerolabs/metadata-tools';
import { LiFiBridge } from './li-fi-bridge';
import dotenv from 'dotenv';
import path from 'path';
import { runCreateOFT } from './utils/runCreateOFT';
import { runDeployOFT } from './utils/runDeployOFT';
import { runInitConfig } from './utils/runInitConfig';
import { runWire } from './utils/runWire';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Add logging middleware
app.use((req, res, next) => {
    console.log('\n=== REQUEST ===');
    console.log(`${req.method} ${req.url}`);
    console.log('Body:', req.body);
    next();
});

// Constants for configuration
const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        msgType: 1,
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 300000,
        value: 0,
    },
];

const SOLANA_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        msgType: 1,
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 200000,
        value: 2500000,
    },
];

interface TokenCreationRequest {
    mintName: string;
    mintSymbol: string;
    totalTokens: string;
    mintUri: string;
    destinationChains: string[]; // Array of chain IDs
}

interface ChainConfig {
    eid: number;
    name: string;
    network: string;
}

// Supported chains configuration
const SUPPORTED_CHAINS: { [key: string]: ChainConfig } = {
    'arbitrum': {
        eid: EndpointId.ARBITRUM_V2_MAINNET,
        name: 'Arbitrum One mainnet',
        network: 'arbitrum'
    },
    'base': {
        eid: EndpointId.BASE_V2_MAINNET,
        name: 'Base mainnet',
        network: 'base'
    },
    'arbitrum-sepolia': {
        eid: EndpointId.ARBSEP_V2_TESTNET,
        name: 'Arbitrum Sepolia',
        network: 'arbitrum-sepolia'
    },
    'sepolia': {
        eid: EndpointId.SEPOLIA_V2_TESTNET,
        name: 'Sepolia',
        network: 'sepolia'
    },
    'base-v2-testnet': {
        eid: EndpointId.BASESEP_V2_TESTNET,
        name: 'Base Testnet',
        network: 'base-sepolia'
    },
    'optimism-sepolia': {
        eid: EndpointId.OPTSEP_V2_TESTNET,
        name: 'Optimism Testnet',
        network: 'optimism-sepolia'
    },
    'blast-sepolia': {
        eid: EndpointId.BLAST_V2_TESTNET,
        name: 'Blast Testnet',
        network: 'blast-sepolia'
    },
    'scroll-sepolia': {
        eid: EndpointId.SCROLL_V2_TESTNET,
        name: 'Scroll Testnet',
        network: 'scroll-sepolia'
    },
    'unichain-sepolia': {
        eid: EndpointId.UNICHAIN_V2_TESTNET,
        name: 'Unichain Testnet',
        network: 'unichain-sepolia'
    },
    'bsc-v2-testnet': {
        eid: EndpointId.BSC_V2_TESTNET,
        name: 'BSC Testnet',
        network: 'bsc-testnet'
    },
    'mumbai': {
        eid: EndpointId.POLYGON_V2_TESTNET,
        name: 'mumbai testnet',
        network: 'mumbai'
    }
};

interface LiFiChainConfig {
    chainId: number;
    rpcUrl: string;
    name: string;
}

interface LiFiChains {
    [key: string]: LiFiChainConfig;
}

// Add Li.Fi chain configurations
const LIFI_CHAINS: LiFiChains = {
    '42161': {  // Arbitrum
        chainId: 42161,
        rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
        name: 'Arbitrum One'
    },
    '8453': {   // Base
        chainId: 8453,
        rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
        name: 'Base'
    },
    '1151111081099710': {  // Solana
        chainId: 1151111081099710,
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        name: 'Solana'
    }
};

// Function to update layerzero.config.ts
async function updateLayerZeroConfig(solanaContract: OmniPointHardhat, destinationChains: string[]) {
    const configContent = readFileSync('layerzero.config.ts', 'utf-8');
    
    // Create OmniPointHardhat objects for each destination chain
    const chainConfigs = destinationChains.map(chain => {
        const chainInfo = SUPPORTED_CHAINS[chain];
        return {
            eid: chainInfo.eid,
            contractName: 'MyOFT',
        };
    });

    // Generate connections configuration
    const connections = await generateConnectionsConfig(
        chainConfigs.map(chainConfig => [
            chainConfig,
            solanaContract,
            [['LayerZero Labs'], []],
            [15, 32],
            [SOLANA_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
        ])
    );

    // Create new config content
    const newConfig = `
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { generateConnectionsConfig } from '@layerzerolabs/metadata-tools'
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

import { getOftStoreAddress } from './tasks/solana'

const solanaContract: OmniPointHardhat = {
    eid: EndpointId.SOLANA_V2_TESTNET,
    address: getOftStoreAddress(EndpointId.SOLANA_V2_TESTNET),
}

${chainConfigs.map((config, index) => `
const chain${index}: OmniPointHardhat = {
    eid: ${config.eid},
    contractName: 'MyOFT',
}`).join('\n')}

const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = ${JSON.stringify(EVM_ENFORCED_OPTIONS, null, 4)}

const SOLANA_ENFORCED_OPTIONS: OAppEnforcedOption[] = ${JSON.stringify(SOLANA_ENFORCED_OPTIONS, null, 4)}

export default async function () {
    const connections = await generateConnectionsConfig([
        ${chainConfigs.map((_, index) => `
        [
            chain${index},
            solanaContract,
            [['LayerZero Labs'], []],
            [15, 32],
            [SOLANA_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
        ],`).join('\n')}
    ])

    return {
        contracts: [
            { contract: solanaContract },
            ${chainConfigs.map((_, index) => `{ contract: chain${index} }`).join(',\n            ')}
        ],
        connections,
    }
}
`;

    writeFileSync('layerzero.config.ts', newConfig);
}

// Function to run interactive commands
function runInteractiveCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { 
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Handle stdout data
        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            console.log(chunk); // Log the output
            
            // Check for all known prompts
            if (chunk.includes('You have chosen `--only-oft-store true`') ||
                chunk.includes('Would you like to preview the transactions before continuing?') ||
                chunk.includes('Would you like to submit the required transactions?') ||
                chunk.includes('Continue?') ||
                chunk.includes('(Y/n)')) {
                child.stdin.write('yes\n');
            }
        });

        // Handle stderr data
        child.stderr.on('data', (data) => {
            console.error(data.toString());
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with code ${code}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

interface TokenCreationProgress {
    step1Completed: boolean;
    step2Completed: { [chain: string]: boolean };
    step3Completed: boolean;
    step4Completed: boolean;
    mintAddress?: string;
    oftStoreAddress?: string;
}

// API endpoint to create a new token with cross-chain support
const createTokenHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const progress: TokenCreationProgress = {
        step1Completed: false,
        step2Completed: {},
        step3Completed: false,
        step4Completed: false
    };

    try {
        const { mintName, mintSymbol, totalTokens, mintUri, destinationChains }: TokenCreationRequest = req.body;

        // Step 1: Create Solana OFT (in-memory, stateless)
        console.log('Step 1: Creating Solana OFT...');
        let oftResult;
        try {
            oftResult = await runCreateOFT({
                eid: '40168', // 30168 for mainnet
                programId: 'HmN84fc4YAhvxF2WnP891XxZb3hoTL1PpjYHyiRXDCc9',
                name: mintName,
                symbol: mintSymbol,
                amount: totalTokens,
                uri: mintUri,
                onlyOftStore: true,
                computeUnitPriceScaleFactor: '200'
            });
            progress.step1Completed = true;
            console.log('Step 1 completed successfully', oftResult);
        } catch (error) {
            console.error('Step 1 failed:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create Solana OFT',
                progress,
                details: error instanceof Error ? error.message : 'Unknown error'
            });
            return;
        }

        // Step 2: Deploy OFTs on destination chains (in-memory, stateless)
        console.log('Step 2: Deploying OFTs on destination chains...');
        const evmDeployments: { [chain: string]: any } = {};
        for (const chain of destinationChains) {
            try {
                const chainInfo = SUPPORTED_CHAINS[chain];
                if (!chainInfo) {
                    throw new Error(`Unsupported chain: ${chain}`);
                }
                console.log(`Deploying OFT on ${chain}...`);
                evmDeployments[chain] = await runDeployOFT({
                    network: chainInfo.network,
                    name: mintName,
                    symbol: mintSymbol
                });
                progress.step2Completed[chain] = true;
                console.log(`Deployment on ${chain} completed successfully`, evmDeployments[chain]);
            } catch (error) {
                console.error(`Deployment on ${chain} failed:`, error);
                res.status(500).json({
                    success: false,
                    error: `Failed to deploy OFT on ${chain}`,
                    progress,
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
                return;
            }
        }

        // Step 3: Update and initialize config (stateless, in-memory)
        console.log('Step 3: Updating and initializing config...');
        let configContent;
        try {
            const solanaContract: OmniPointHardhat = {
                eid: EndpointId.SOLANA_V2_TESTNET,
                address: oftResult.oftStore, // Use the address from step 1
            };

            // Generate config content in memory
            const chainConfigs = destinationChains.map(chain => {
                const chainInfo = SUPPORTED_CHAINS[chain];
                return {
                    eid: chainInfo.eid,
                    contractName: 'MyOFT',
                    address: evmDeployments[chain].address // Use the deployed contract address
                };
            });

            // Generate connections configuration
            const connections = await generateConnectionsConfig(
                chainConfigs.map(chainConfig => [
                    chainConfig,
                    solanaContract,
                    [['LayerZero Labs'], []],
                    [15, 32],
                    [SOLANA_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
                ])
            );

            // Create config content
            configContent = `
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { generateConnectionsConfig } from '@layerzerolabs/metadata-tools'
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

const solanaContract: OmniPointHardhat = {
    eid: EndpointId.SOLANA_V2_TESTNET,
    address: "${solanaContract.address}",
}

${chainConfigs.map((config, index) => `
const chain${index}: OmniPointHardhat = {
    eid: ${config.eid},
    contractName: 'MyOFT',
    address: "${config.address}",
}`).join('\n')}

const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = ${JSON.stringify(EVM_ENFORCED_OPTIONS, null, 4)}

const SOLANA_ENFORCED_OPTIONS: OAppEnforcedOption[] = ${JSON.stringify(SOLANA_ENFORCED_OPTIONS, null, 4)}

export default async function () {
    const connections = await generateConnectionsConfig([
        ${chainConfigs.map((_, index) => `
        [
            chain${index},
            solanaContract,
            [['LayerZero Labs'], []],
            [15, 32],
            [SOLANA_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
        ],`).join('\n')}
    ])

    return {
        contracts: [
            { contract: solanaContract },
            ${chainConfigs.map((_, index) => `{ contract: chain${index} }`).join(',\n            ')}
        ],
        connections,
    }
}
`;

            // Initialize the config
            const initConfigOutput = await runInitConfig(configContent);
            progress.step3Completed = true;
            console.log('Config/init step completed successfully', initConfigOutput);
        } catch (error) {
            console.error('Step 3 failed:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to initialize config',
                progress,
                details: error instanceof Error ? error.message : 'Unknown error'
            });
            return;
        }

        // Step 4: Wire each network (stateless, in-memory)
        try {
            for (const chain of destinationChains) {
                const chainInfo = SUPPORTED_CHAINS[chain];
                if (!chainInfo) {
                    throw new Error(`Unsupported chain: ${chain}`);
                }
                const wireOutput = await runWire(configContent, chainInfo.network);
                console.log(`Wiring configuration for ${chain} completed successfully`, wireOutput);
            }
        progress.step4Completed = true;
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to wire configuration',
                progress,
                details: error instanceof Error ? error.message : 'Unknown error'
            });
            return;
        }

        res.json({ 
            success: true, 
            message: 'Token created successfully with cross-chain support',
            progress 
        });
    } catch (error: unknown) {
        console.error('Unexpected error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Unexpected error occurred',
            progress,
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

app.post('/api/create-token', createTokenHandler);

// API endpoint to get supported chains
app.get('/api/supported-chains', (req: Request, res: Response) => {
    res.json(SUPPORTED_CHAINS);
});

interface CrossChainTransferRequest {
    fromChain: string;
    toChain: string;
    amount: string;
    to: string;
    contractAddress?: string; // For EVM->Solana
    mint?: string; // For Solana->EVM
    escrow?: string; // For Solana->EVM
    toEid?: string; // For Solana->EVM
}

// API endpoint for cross-chain transfers
const crossChainTransferHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { fromChain, toChain, amount, to, contractAddress, mint, escrow, toEid }: CrossChainTransferRequest = req.body;

        // Validate chains
        if (fromChain === 'solana') {
            // Solana to EVM transfer
            if (!mint || !escrow || !toEid) {
                throw new Error('Missing required parameters for Solana to EVM transfer: mint, escrow, toEid');
            }
            await runInteractiveCommand('pnpm', [
                'hardhat',
                'lz:oft:solana:send',
                '--amount', amount,
                '--from-eid', '40168',
                '--to', to,
                '--mint', mint,
                '--escrow', escrow,
                '--to-eid', toEid
            ]);
        } else if (toChain === 'solana') {
            // EVM to Solana transfer
            const chainInfo = SUPPORTED_CHAINS[fromChain];
            if (!chainInfo) {
                throw new Error(`Unsupported source chain: ${fromChain}`);
            }
            if (!contractAddress) {
                throw new Error('Missing contractAddress for EVM to Solana transfer');
            }
            await runInteractiveCommand('pnpm', [
                'hardhat',
                '--network', chainInfo.network,
                'send',
                '--dst-eid', '40168',
                '--amount', amount,
                '--to', to,
                '--contract-address', contractAddress
            ]);
        } else {
            throw new Error(`Unsupported transfer direction: from ${fromChain} to ${toChain}`);
        }

        res.json({ success: true, message: 'Cross-chain transfer initiated successfully' });
    } catch (error: unknown) {
        console.error('Cross-chain transfer failed:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Cross-chain transfer failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

app.post('/api/cross-chain-transfer', crossChainTransferHandler);

interface LiFiBridgeRequest {
    fromChain: string;  // Chain ID (e.g., "42161" for Arbitrum)
    toChain: string;    // Chain ID (e.g., "1151111081099710" for Solana)
    fromToken: string;  // Token address or symbol
    toToken: string;    // Token address or symbol
    amount: string;     // Amount in wei
    to?: string;        // Optional destination address
    fromAddress: string; // Added fromAddress parameter
}

// Li.Fi bridge handler
const liFiBridgeHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        console.log('\n=== LI.FI BRIDGE REQUEST ===');
        const { fromChain, toChain, fromToken, toToken, amount, to, fromAddress }: LiFiBridgeRequest = req.body;
        console.log('Request parameters:', { fromChain, toChain, fromToken, toToken, amount, to, fromAddress });

        // Validate chain IDs
        if (!fromChain || !toChain) {
            console.error('Invalid chain IDs:', { fromChain, toChain });
            throw new Error('Invalid chain IDs. Both fromChain and toChain must be provided');
        }

        // Get RPC URL and chain ID for the source chain
        const sourceChainConfig = LIFI_CHAINS[fromChain];
        if (!sourceChainConfig) {
            console.error('Unsupported source chain:', fromChain);
            throw new Error(`Unsupported source chain: ${fromChain}`);
        }

        console.log('Chain configuration:', {
            fromChain: sourceChainConfig
        });

        // Initialize Li.Fi bridge for the source chain
        const bridge = new LiFiBridge(
            sourceChainConfig.rpcUrl,
            process.env.PRIVATE_KEY || '',
            sourceChainConfig.chainId
        );

        console.log('Initializing bridge...');
        // Initialize the bridge with chain and token information
        await bridge.initialize();
        console.log('Bridge initialized successfully');

        console.log('Executing bridge transaction...');
        // Execute the bridge transaction
        const result = await bridge.bridge(
            fromChain,
            toChain,
            fromToken,
            toToken,
            amount,
            to,
            fromAddress
        );

        console.log('Bridge transaction successful:', result);
        res.json({
            success: true,
            message: 'Bridge transaction initiated successfully',
            txHash: result.txHash,
            status: result.status
        });
    } catch (error) {
        console.error('\n=== LI.FI BRIDGE ERROR ===');
        console.error('Error details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate bridge transaction',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

// Add Li.Fi bridge endpoint
app.post('/api/li-fi-bridge', liFiBridgeHandler);

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});