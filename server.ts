import express, { Request, Response, RequestHandler } from 'express';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync } from 'fs';
import { EndpointId } from '@layerzerolabs/lz-definitions';
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat';
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities';
import { generateConnectionsConfig } from '@layerzerolabs/metadata-tools';

const app = express();
app.use(express.json());

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

// Function to run interactive commands with retry
async function runInteractiveCommandWithRetry(command: string, args: string[], maxRetries = 3): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of ${maxRetries}...`);
            await runInteractiveCommand(command, args);
            return; // Success, exit the retry loop
        } catch (error) {
            lastError = error as Error;
            console.error(`Attempt ${attempt} failed:`, error);
            
            // If it's a transaction expiration error, wait before retrying
            if (error instanceof Error && error.message.includes('TransactionExpiredBlockheightExceededError')) {
                const waitTime = attempt * 5000; // Increase wait time with each retry
                console.log(`Waiting ${waitTime/1000} seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // For other errors, throw immediately
            throw error;
        }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError;
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

        // Step 1: Create Solana OFT
        console.log('Step 1: Creating Solana OFT...');
        try {
            await runInteractiveCommandWithRetry('pnpm', [
                'hardhat',
                'lz:oft:solana:create',
                '--eid', '40168',
                '--program-id', 'HmN84fc4YAhvxF2WnP891XxZb3hoTL1PpjYHyiRXDCc9',
                '--name', mintName,
                '--symbol', mintSymbol,
                '--amount', totalTokens,
                '--uri', mintUri,
                '--only-oft-store', 'true',
                '--compute-unit-price-scale-factor', '200'
            ]);
            progress.step1Completed = true;
            console.log('Step 1 completed successfully');
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

        // Step 2: Deploy OFTs on destination chains
        console.log('Step 2: Deploying OFTs on destination chains...');
        for (const chain of destinationChains) {
            try {
                const chainInfo = SUPPORTED_CHAINS[chain];
                if (!chainInfo) {
                    throw new Error(`Unsupported chain: ${chain}`);
                }
                console.log(`Deploying OFT on ${chain}...`);
                await runInteractiveCommandWithRetry('npx', ['hardhat', 'deploy', '--network', chainInfo.network, '--tags', 'MyOFT']);
                progress.step2Completed[chain] = true;
                console.log(`Deployment on ${chain} completed successfully`);
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

        // Step 3: Update and initialize config for each network
        console.log('Step 3: Updating and initializing config...');
        try {
            const solanaContract: OmniPointHardhat = {
                eid: EndpointId.SOLANA_V2_TESTNET,
                address: '', // This will be populated by getOftStoreAddress
            };
            await updateLayerZeroConfig(solanaContract, destinationChains);
            
            // First initialize Solana configuration with explicit eid
            console.log('Initializing Solana configuration...');
            await runInteractiveCommandWithRetry('pnpm', [
                'hardhat',
                'lz:oft:solana:init-config',
                '--oapp-config',
                'layerzero.config.ts'
            ]);
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Then wire each network
            for (const chain of destinationChains) {
                const chainInfo = SUPPORTED_CHAINS[chain];
                console.log(`Wiring configuration for ${chain}...`);
                await runInteractiveCommandWithRetry('pnpm', [
                    'hardhat',
                    'lz:oapp:wire',
                    '--oapp-config',
                    'layerzero.config.ts',
                    '--network',
                    chainInfo.network
                ]);
                // Wait between wiring operations
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            progress.step3Completed = true;
            console.log('Step 3 completed successfully');
        } catch (error) {
            console.error('Step 3 failed:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update and initialize config',
                progress,
                details: error instanceof Error ? error.message : 'Unknown error'
            });
            return;
        }

        // Remove Step 4 since wiring is now part of Step 3
        progress.step4Completed = true;

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
}

// API endpoint for cross-chain transfers
const crossChainTransferHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { fromChain, toChain, amount, to }: CrossChainTransferRequest = req.body;

        // Validate chains
        if (fromChain === 'solana') {
            // Solana to EVM transfer
            const chainInfo = SUPPORTED_CHAINS[toChain];
            if (!chainInfo) {
                throw new Error(`Unsupported destination chain: ${toChain}`);
            }

            await runInteractiveCommandWithRetry('pnpm', [
                'hardhat',
                'lz:oft:solana:send',
                '--amount', amount,
                '--from-eid', '40168',
                '--to', to,
                '--to-eid', chainInfo.eid.toString()
            ]);
        } else if (toChain === 'solana') {
            // EVM to Solana transfer
            const chainInfo = SUPPORTED_CHAINS[fromChain];
            if (!chainInfo) {
                throw new Error(`Unsupported source chain: ${fromChain}`);
            }

            await runInteractiveCommandWithRetry('pnpm', [
                'hardhat',
                '--network', chainInfo.network,
                'send',
                '--dst-eid', '40168',
                '--amount', amount,
                '--to', to
            ]);
        } else {
            throw new Error('Invalid chain combination. One chain must be Solana');
        }

        res.json({
            success: true,
            message: 'Cross-chain transfer initiated successfully'
        });
    } catch (error) {
        console.error('Cross-chain transfer failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate cross-chain transfer',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

app.post('/api/cross-chain-transfer', crossChainTransferHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 