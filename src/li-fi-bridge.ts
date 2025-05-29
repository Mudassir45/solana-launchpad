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
            const chainsResponse = await axios.get<LiFiChainsResponse>(`${API_URL}/chains`, {
                params: { chainTypes: 'EVM' }
            });
            
            // Create a map of chain keys to chain info for easy lookup
            chainsResponse.data.chains.forEach(chain => {
                this.chains.set(chain.key, chain);
            });

            // Fetch tokens for all chains
            const chainIds = chainsResponse.data.chains.map(chain => chain.id);
            const tokensResponse = await axios.get<LiFiTokensResponse>(`${API_URL}/tokens`, {
                params: {
                    chains: chainIds.join(','),
                    chainTypes: 'EVM'
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
        fromAddress: string
    ): Promise<LiFiQuote> {
        try {
            const fromChainKey = this.getChainKey(fromChain);
            const toChainKey = this.getChainKey(toChain);

            // Validate tokens and get their addresses
            const [fromTokenInfo, toTokenInfo] = await Promise.all([
                this.validateToken(fromChain, fromToken),
                this.validateToken(toChain, toToken)
            ]);

            const response = await axios.get(`${API_URL}/quote`, {
                params: {
                    fromChain: fromChainKey,
                    toChain: toChainKey,
                    fromToken: fromTokenInfo.address,
                    toToken: toTokenInfo.address,
                    fromAmount,
                    fromAddress,
                }
            });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                throw new Error(`Failed to get Li.Fi quote: ${error.response.data.message || error.message}`);
            }
            throw new Error(`Failed to get Li.Fi quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getStatus(bridge: string, fromChain: string, toChain: string, txHash: string): Promise<LiFiStatus> {
        try {
            const fromChainKey = this.getChainKey(fromChain);
            const toChainKey = this.getChainKey(toChain);

            const response = await axios.get(`${API_URL}/status`, {
                params: {
                    bridge,
                    fromChain: fromChainKey,
                    toChain: toChainKey,
                    txHash,
                }
            });
            return response.data;
        } catch (error) {
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

    async bridge(
        fromChain: string,
        toChain: string,
        fromToken: string,
        toToken: string,
        fromAmount: string
    ): Promise<{ txHash: string; status: LiFiStatus }> {
        try {
            // Get quote from Li.Fi
            const quote = await this.getQuote(
                fromChain,
                toChain,
                fromToken,
                toToken,
                fromAmount,
                await this.wallet.getAddress()
            );

            // Check and set allowance if needed
            await this.checkAndSetAllowance(
                quote.action.fromToken.address,
                quote.estimate.approvalAddress,
                fromAmount
            );

            // Send the bridge transaction
            const tx = await this.wallet.sendTransaction(quote.transactionRequest);
            await tx.wait();

            // If it's a cross-chain transfer, wait for the status
            if (fromChain !== toChain) {
                let status: LiFiStatus;
                // Add logging for debugging
                console.log('Li.Fi quote.tool:', quote.tool);
                console.log('Li.Fi tx.hash:', tx.hash);
                do {
                    status = await this.getStatus(quote.tool, fromChain, toChain, tx.hash);
                    if (status.status === 'FAILED') {
                        throw new Error('Bridge transaction failed');
                    }
                    if (status.status === 'PENDING') {
                        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before next check
                    }
                } while (status.status === 'PENDING');

                return { txHash: tx.hash, status };
            }

            return { txHash: tx.hash, status: { status: 'DONE', fromChain, toChain, txHash: tx.hash } };
        } catch (error) {
            throw new Error(`Bridge transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
} 