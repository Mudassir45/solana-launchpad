# LayerZero Omni-Chain Token (OFT) Deployment with Li-Fi Bridge Integration

This project demonstrates how to deploy and manage Omni-Chain Tokens (OFTs) using LayerZero's cross-chain messaging protocol and Li-Fi's bridge integration. The implementation allows for token transfers between different blockchain networks, including Arbitrum, Base, and Solana, with support for both native LayerZero bridging and Li-Fi's aggregated bridge solutions.

## Prerequisites

- Node.js (v18 or higher)
- pnpm package manager
- MetaMask or another Web3 wallet
- Testnet ETH for gas fees
- Solana CLI tools (for Solana operations)

## Project Structure

```
.
├── src/
│   ├── server.ts           # API server for token creation and bridging
│   └── li-fi-bridge.ts     # Li-Fi bridge integration
├── contracts/              # Smart contract implementations
├── deploy/                 # Deployment scripts
├── tasks/                  # Hardhat tasks
└── layerzero.config.ts     # LayerZero configuration
```

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Configure environment variables:
Create a `.env` file according to .env.example:

## Supported Networks

The project currently supports the following networks:

### LayerZero Networks
- Arbitrum Sepolia (Endpoint ID: 40168)
- BSC Testnet (Endpoint ID: 40102)
- Solana Testnet (Endpoint ID: 40231)
- Base Testnet (Endpoint ID: 40245)
- Optimism Sepolia (Endpoint ID: 40232)
- Blast Sepolia (Endpoint ID: 40234)
- Scroll Sepolia (Endpoint ID: 40235)
- Unichain Sepolia (Endpoint ID: 40236)
- Mumbai Testnet (Endpoint ID: 40109)

### Li-Fi Bridge Networks
- Arbitrum One (Chain ID: 42161)
- Base (Chain ID: 8453)
- Solana (Chain ID: 1151111081099710)

## API Endpoints

### 1. Create Token
```bash
POST /api/create-token
{
    "mintName": "MyOFT",
    "mintSymbol": "MOFT",
    "totalTokens": "1000000",
    "mintUri": "https://example.com/token",
    "destinationChains": ["arbitrum-sepolia", "bsc-v2-testnet"]
}
```

The token creation process involves four main steps:

1. **Solana OFT Creation**
   - Creates the SPL token on Solana network
   - Sets up the OFT store account for cross-chain operations
   - Configures token metadata including name, symbol, and URI
   - Mints the initial token supply

2. **EVM Chain Deployment**
   - Deploys the OFT contract for that SPL on each specified EVM chain
   - Configures cross-chain messaging parameters
   - Initializes token supply and permissions

3. **Configuration Update**
   - Updates the LayerZero configuration file
   - Sets up enforced options for cross-chain messaging
   - Configures gas limits and execution parameters
   - Establishes connection parameters between chains

4. **Configuration Wiring**
   - Establishes connections between Solana and EVM chains
   - Sets up message passing routes for cross-chain operations
   - Configures security parameters and permissions
   - Verifies the setup with test transactions

Each step is tracked and reported in the response, allowing for easy monitoring of the deployment progress. The process includes automatic retry mechanisms for handling network issues and transaction failures.

### 2. Cross-Chain Transfer (LayerZero)

from Solana to EVM cross-chain transfer of Layer zero OFTs:

Parameters:
- `amount`: Amount of tokens to transfer
- `from-eid`: Source chain endpoint ID (40168 for Solana devnet)
- `to`: Destination address on Solana
- `mint`: SPL token mint address
- `escrow`: OFT escrow contract address
- `to-eid`: Destination chain endpoint ID (40231 for Arbitrum-Sepolia Testnet)

```bash
pnpm hardhat lz:oft:solana:send \
```

from EVM to Solana cross-chain transfer of Layer zero OFTs:
```bash
pnpm hardhat --network sepolia-testnet send --dst-eid 40168 --amount <AMOUNT> --to <TO>
```

### 3. Li-Fi Bridge Transfer
```bash
POST /api/li-fi-bridge
{
    "fromChain": "42161",  // Arbitrum
    "toChain": "1151111081099710",  // Solana
    "fromToken": "ETH",
    "toToken": "SOL",
    "amount": "1000000000000000000",  // 1 ETH in wei
    "fromAddress": "your_address",
    "to": "destination_address"  // Optional
}
```

## Features

### LayerZero OFT Integration
- Native cross-chain token transfers
- Automated contract deployment
- Configurable gas limits and execution parameters
- Support for multiple EVM chains and Solana

### Li-Fi Bridge Integration
- Aggregated bridge solutions
- Support for multiple tokens and chains
- Automatic token allowance management
- Real-time quote fetching
- Transaction status tracking

## Deployment Process

1. **Token Creation**
   - Creates the initial token on Solana
   - Sets up the OFT store account
   - Configures token metadata

2. **Chain Deployment**
   - Deploys contracts on specified chains
   - Configures cross-chain messaging
   - Sets up token metadata

3. **Bridge Configuration**
   - Updates LayerZero configuration
   - Sets up Li-Fi bridge connections
   - Configures security parameters

## Security Considerations

1. **Private Keys**: Never commit private keys to the repository
2. **Gas Limits**: Configure appropriate gas limits for each network
3. **Access Control**: Implement proper access control for token operations
4. **Cross-Chain Security**: Verify message authenticity on receiving chains
5. **Bridge Security**: Validate bridge transactions and quotes

## Troubleshooting

Common issues and solutions:

1. **Transaction Failures**
   - Check gas limits
   - Verify network connectivity
   - Ensure sufficient funds for gas

2. **Bridge Issues**
   - Verify token allowances
   - Check bridge liquidity
   - Validate quote parameters

3. **Cross-Chain Message Failures**
   - Verify endpoint configurations
   - Check enforced options
   - Validate message parameters