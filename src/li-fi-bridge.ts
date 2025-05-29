import { ethers } from 'ethers';
import axios from 'axios';

const API_URL = 'https://li.quest/v1';

interface LiFiChain {
    id: number;
    key: string;
    name: string;
    chainType: string;
    coin: string;
    mainnet: boolean;
    logoURI: string;
    tokenlistUrl: string;
    multicallAddress: string;
    metamask: {
        chainId: string;
        blockExplorerUrls: string[];
        chainName: string;
        nativeCurrency: {
            name: string;
            symbol: string;
            decimals: number;
        };
        rpcUrls: string[];
    };
    nativeToken: {
        address: string;
        symbol: string;
        decimals: number;
        chainId: number;
        name: string;
        coinKey: string;
        priceUSD: string;
        logoURI: string;
    };
}

interface LiFiToken {
    address: string;
    decimals: number;
    symbol: string;
    chainId: number;
    coinKey: string;
    name: string;
    logoURI: string;
    priceUSD: string;
}

interface LiFiChainsResponse {
    chains: LiFiChain[];
}

interface LiFiTokensResponse {
    tokens: {
        [chainId: string]: LiFiToken[];
    };
}

interface LiFiQuote {
    action: {
        fromToken: {
            address: string;
            symbol: string;
            decimals: number;
        };
        toToken: {
            address: string;
            symbol: string;
            decimals: number;
        };
    };
    estimate: {
        approvalAddress: string;
        fromAmount: string;
        toAmount: string;
    };
    transactionRequest: {
        data: string;
        to: string;
        value: string;
    };
    tool: string;
}

interface LiFiStatus {
    status: 'PENDING' | 'DONE' | 'FAILED';
    fromChain: string;
    toChain: string;
    txHash: string;
}

export class LiFiBridge {
    private provider: ethers.providers.JsonRpcProvider;
    private wallet: ethers.Wallet;
    private chains: Map<string, LiFiChain> = new Map();
    private tokens: Map<number, Map<string, LiFiToken>> = new Map();

    constructor(
        private readonly rpcUrl: string,
        private readonly privateKey: string,
        private readonly chainId: number
    ) {
        this.provider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
    }

    async initialize(): Promise<void> {
        try {
            // Fetch chains
            const chainsResponse = await axios.get<LiFiChainsResponse>(`${API_URL}/chains`);
            
            // Create a map of chain keys to chain info for easy lookup
            chainsResponse.data.chains.forEach(chain => {
                this.chains.set(chain.key, chain);
            });

            // Fetch tokens for all chains
            const chainIds = chainsResponse.data.chains.map(chain => chain.id);
            const tokensResponse = await axios.get<LiFiTokensResponse>(`${API_URL}/tokens`, {
                params: {
                    chains: chainIds.join(',')
                }
            });

            // Organize tokens by chain ID and symbol for easy lookup
            Object.entries(tokensResponse.data.tokens).forEach(([chainId, tokens]) => {
                const tokenMap = new Map<string, LiFiToken>();
                tokens.forEach(token => {
                    tokenMap.set(token.symbol.toLowerCase(), token);
                    tokenMap.set(token.address.toLowerCase(), token);
                });
                this.tokens.set(Number(chainId), tokenMap);
            });
        } catch (error) {
            throw new Error(`Failed to initialize Li.Fi bridge: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private getChainKey(chainName: string): string {
        const chain = Array.from(this.chains.values()).find(c => 
            c.name.toLowerCase() === chainName.toLowerCase() || 
            c.key.toLowerCase() === chainName.toLowerCase()
        );
        
        if (!chain) {
            throw new Error(`Unsupported chain: ${chainName}`);
        }
        
        return chain.key;
    }

    private getChainId(chainName: string): number {
        const chain = Array.from(this.chains.values()).find(c => 
            c.name.toLowerCase() === chainName.toLowerCase() || 
            c.key.toLowerCase() === chainName.toLowerCase()
        );
        
        if (!chain) {
            throw new Error(`Unsupported chain: ${chainName}`);
        }
        
        return chain.id;
    }

    async getTokenInfo(chain: string, token: string): Promise<LiFiToken> {
        try {
            const chainKey = this.getChainKey(chain);
            const response = await axios.get<LiFiToken>(`${API_URL}/token`, {
                params: {
                    chain: chainKey,
                    token,
                }
            });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                throw new Error(`Failed to get token info: ${error.response.data.message || error.message}`);
            }
            throw new Error(`Failed to get token info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async validateToken(chain: string, token: string): Promise<LiFiToken> {
        // First try to get token info from our cached tokens
        const chainId = this.getChainId(chain);
        const chainTokens = this.tokens.get(chainId);
        
        if (chainTokens) {
            const cachedToken = chainTokens.get(token.toLowerCase());
            if (cachedToken) {
                return cachedToken;
            }
        }

        // If not found in cache, fetch from API
        return this.getTokenInfo(chain, token);
    }

    async getQuote(
        fromChain: string,
        toChain: string,
        fromToken: string,
        toToken: string,
        fromAmount: string,
        fromAddress: string,
        toAddress?: string
    ): Promise<LiFiQuote> {
        try {
            const params: any = {
                fromChain,
                toChain,
                fromToken,
                toToken,
                fromAmount,
                fromAddress,
                chainTypes: 'EVM,SVM'
            };

            // Add toAddress for Solana transfers
            if (toChain === '1151111081099710' && toAddress) {
                params.toAddress = toAddress;
            }

            console.log('Getting quote with params:', params);
            const response = await axios.get(`${API_URL}/quote`, { params });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                console.error('Li.Fi quote error:', error.response.data);
                throw new Error(`Failed to get Li.Fi quote: ${error.response.data.message || error.message}`);
            }
            throw new Error(`Failed to get Li.Fi quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getStatus(bridge: string, fromChain: string, toChain: string, txHash: string): Promise<LiFiStatus> {
        try {
            console.log('Getting status with params:', { bridge, fromChain, toChain, txHash });
            const response = await axios.get(`${API_URL}/status`, {
                params: {
                    bridge,
                    fromChain,
                    toChain,
                    txHash,
                }
            });
            return response.data;
        } catch (error) {
            console.error('Status check error:', error);
            throw new Error(`Failed to get Li.Fi status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async checkAndSetAllowance(tokenAddress: string, approvalAddress: string, amount: string): Promise<void> {
        const ERC20_ABI = [
            'function allowance(address,address) external view returns (uint256)',
            'function approve(address, uint256) external'
        ];

        // Skip approval for native token
        if (tokenAddress === ethers.constants.AddressZero) {
            return;
        }

        const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);
        const allowance = await erc20.allowance(await this.wallet.getAddress(), approvalAddress);

        // Use the amount directly without parsing
        if (allowance.lt(amount)) {
            const tx = await erc20.approve(approvalAddress, amount);
            await tx.wait();
        }
    }

    private formatSolanaAddress(address: string): string {
        // Remove any whitespace and ensure it's a valid Base58 address
        return address.trim();
    }

    async bridge(
        fromChain: string,
        toChain: string,
        fromToken: string,
        toToken: string,
        fromAmount: string,
        to?: string
    ): Promise<{ txHash: string; status: LiFiStatus }> {
        try {
            console.log('\n=== BRIDGE REQUEST START ===');
            console.log('Input parameters:', {
                fromChain,
                toChain,
                fromToken,
                toToken,
                fromAmount,
                to
            });

            // For Arbitrum to Solana transfers, use direct values
            let fromChainId = fromChain;
            let toChainId = toChain;
            let fromTokenAddress = fromToken;
            let toTokenAddress = toToken;

            // If not using direct values, fetch and map as before
            if (fromChain.toLowerCase() !== 'arbitrum' || toChain.toLowerCase() !== 'solana') {
                console.log('Fetching chain and token information...');
                const [chainsResponse, tokensResponse] = await Promise.all([
                    axios.get(`${API_URL}/chains`),
                    axios.get(`${API_URL}/tokens`)
                ]);

                // Create maps and get IDs as before
                const chainIdMap = new Map<string, string>();
                chainsResponse.data.chains.forEach((chain: any) => {
                    chainIdMap.set(chain.key.toLowerCase(), chain.id.toString());
                    chainIdMap.set(chain.name.toLowerCase(), chain.id.toString());
                });

                const tokenAddressMap = new Map<string, Map<string, string>>();
                Object.entries(tokensResponse.data.tokens).forEach(([chainId, tokens]: [string, any]) => {
                    const chainTokens = new Map<string, string>();
                    tokens.forEach((token: any) => {
                        chainTokens.set(token.symbol.toLowerCase(), token.address);
                        chainTokens.set(token.address.toLowerCase(), token.address);
                    });
                    tokenAddressMap.set(chainId, chainTokens);
                });

                fromChainId = chainIdMap.get(fromChain.toLowerCase()) || fromChain;
                toChainId = chainIdMap.get(toChain.toLowerCase()) || toChain;

                const fromChainTokens = tokenAddressMap.get(fromChainId);
                const toChainTokens = tokenAddressMap.get(toChainId);

                if (fromChainTokens) {
                    fromTokenAddress = fromChainTokens.get(fromToken.toLowerCase()) || fromToken;
                }
                if (toChainTokens) {
                    toTokenAddress = toChainTokens.get(toToken.toLowerCase()) || toToken;
                }
            } else {
                console.log('Using direct values for Arbitrum to Solana transfer');
                // For Arbitrum to Solana, use the known values
                fromChainId = '42161';
                toChainId = '1151111081099710';
                fromTokenAddress = '0x0000000000000000000000000000000000000000';
                toTokenAddress = '11111111111111111111111111111111';
            }

            console.log('\n=== MAPPED VALUES ===');
            console.log('Chain IDs:', {
                fromChainId,
                toChainId
            });
            console.log('Token Addresses:', {
                fromTokenAddress,
                toTokenAddress
            });

            // If this is a Solana destination, format the address
            const destinationAddress = to ? (toChain.toLowerCase() === 'solana' ? this.formatSolanaAddress(to) : to) : this.wallet.address;
            console.log('Destination Address:', destinationAddress);

            // Get quote with destination address for Solana
            console.log('\n=== GETTING QUOTE ===');
            const quoteParams = {
                fromChainId,
                toChainId,
                fromTokenAddress,
                toTokenAddress,
                fromAmount,
                fromAddress: this.wallet.address,
                toAddress: destinationAddress
            };
            console.log('Quote parameters:', quoteParams);

            const quote = await this.getQuote(
                fromChainId,
                toChainId,
                fromTokenAddress,
                toTokenAddress,
                fromAmount,
                this.wallet.address,
                destinationAddress
            );

            console.log('\n=== QUOTE RECEIVED ===');
            console.log('Quote details:', {
                tool: quote.tool,
                fromAmount: quote.estimate.fromAmount,
                toAmount: quote.estimate.toAmount
            });

            // Check and set allowance if needed
            if (quote.estimate.approvalAddress) {
                console.log('\n=== APPROVAL NEEDED ===');
                console.log('Approval details:', {
                    token: quote.action.fromToken.address,
                    spender: quote.estimate.approvalAddress,
                    amount: quote.estimate.fromAmount
                });
                await this.checkAndSetAllowance(
                    quote.action.fromToken.address,
                    quote.estimate.approvalAddress,
                    quote.estimate.fromAmount
                );
            }

            // Prepare transaction
            const tx = {
                ...quote.transactionRequest,
                from: this.wallet.address
            };

            console.log('\n=== PREPARED TRANSACTION ===');
            console.log('Transaction details:', {
                to: tx.to,
                value: tx.value,
                data: tx.data ? `${tx.data.substring(0, 66)}...` : undefined,
                from: tx.from
            });

            // Send transaction
            console.log('\n=== SENDING TRANSACTION ===');
            const transaction = await this.wallet.sendTransaction(tx);
            console.log('Transaction sent:', transaction.hash);
            
            const receipt = await transaction.wait();
            console.log('Transaction confirmed:', receipt.transactionHash);

            // Get status
            const status = await this.getStatus(
                quote.tool,
                fromChainId,
                toChainId,
                receipt.transactionHash
            );

            console.log('\n=== BRIDGE COMPLETE ===');
            console.log('Final status:', status);

            return {
                txHash: receipt.transactionHash,
                status
            };
        } catch (error) {
            console.error('\n=== BRIDGE ERROR ===');
            if (axios.isAxiosError(error) && error.response) {
                console.error('Li.Fi API error:', {
                    status: error.response.status,
                    data: error.response.data
                });
                throw new Error(`Failed to execute bridge transaction: ${error.response.data.message || error.message}`);
            }
            console.error('Error details:', error);
            throw new Error(`Failed to execute bridge transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Static method to get connections
    static async getConnections({ fromChain, toChain, fromToken, toToken, chainTypes }: {
        fromChain?: string;
        toChain?: string;
        fromToken?: string;
        toToken?: string;
        chainTypes?: string;
    } = {}): Promise<any> {
        try {
            const params: any = {};
            
            // First, fetch all supported chains and tokens
            const [chainsResponse, tokensResponse] = await Promise.all([
                axios.get(`${API_URL}/chains`),
                axios.get(`${API_URL}/tokens`)
            ]);

            // Create a map of chain names to IDs
            const chainIdMap = new Map<string, string>();
            chainsResponse.data.chains.forEach((chain: any) => {
                chainIdMap.set(chain.key.toLowerCase(), chain.id.toString());
                chainIdMap.set(chain.name.toLowerCase(), chain.id.toString());
            });

            // Create a map of token symbols to addresses by chain
            const tokenAddressMap = new Map<string, Map<string, string>>();
            Object.entries(tokensResponse.data.tokens).forEach(([chainId, tokens]: [string, any]) => {
                const chainTokens = new Map<string, string>();
                tokens.forEach((token: any) => {
                    chainTokens.set(token.symbol.toLowerCase(), token.address);
                    chainTokens.set(token.address.toLowerCase(), token.address);
                });
                tokenAddressMap.set(chainId, chainTokens);
            });

            // Apply the mappings to the request parameters
            if (fromChain) {
                const fromChainId = chainIdMap.get(fromChain.toLowerCase());
                if (fromChainId) {
                    params.fromChain = fromChainId;
                } else {
                    params.fromChain = fromChain; // Fallback to original value
                }
            }

            if (toChain) {
                const toChainId = chainIdMap.get(toChain.toLowerCase());
                if (toChainId) {
                    params.toChain = toChainId;
                } else {
                    params.toChain = toChain; // Fallback to original value
                }
            }

            if (fromToken && params.fromChain) {
                const chainTokens = tokenAddressMap.get(params.fromChain);
                if (chainTokens) {
                    const tokenAddress = chainTokens.get(fromToken.toLowerCase());
                    if (tokenAddress) {
                        params.fromToken = tokenAddress;
                    } else {
                        params.fromToken = fromToken; // Fallback to original value
                    }
                }
            }

            if (toToken && params.toChain) {
                const chainTokens = tokenAddressMap.get(params.toChain);
                if (chainTokens) {
                    const tokenAddress = chainTokens.get(toToken.toLowerCase());
                    if (tokenAddress) {
                        params.toToken = tokenAddress;
                    } else {
                        params.toToken = toToken; // Fallback to original value
                    }
                }
            }

            if (chainTypes) {
                params.chainTypes = chainTypes;
            } else {
                params.chainTypes = 'EVM,SVM';
            }

            console.log('Requesting Li.Fi connections with params:', params);
            const result = await axios.get(`${API_URL}/connections`, { params });
            return result.data;
        } catch (error) {
            console.error('Li.Fi connections error:', error);
            throw new Error(`Failed to fetch Li.Fi connections: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
} 