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

POST /api/cross-chain-transfer

#### Solana to EVM cross-chain transfer of LayerZero OFTs:
Parameters:
- `fromChain`: "solana"
- `toChain`: destination EVM chain (e.g., "arbitrum-sepolia")
- `amount`: Amount of tokens to transfer
- `to`: Destination EVM address
- `mint`: SPL token mint address
- `escrow`: OFT escrow contract address
- `toEid`: Destination chain endpoint ID (e.g., "40168" for Arbitrum-Sepolia)

Example:
```json
{
  "fromChain": "solana",
  "toChain": "arbitrum-sepolia",
  "amount": "100",
  "to": "0xEvmRecipient",
  "mint": "So1anaMintAddress",
  "escrow": "So1anaEscrowAddress",
  "toEid": "40168"
}
```

#### EVM to Solana cross-chain transfer of LayerZero OFTs:
Parameters:
- `fromChain`: source EVM chain (e.g., "sepolia")
- `toChain`: "solana"
- `amount`: Amount of tokens to transfer
- `to`: Destination Solana address
- `contractAddress`: OFT contract address on EVM

Example:
```json
{
  "fromChain": "sepolia",
  "toChain": "solana",
  "amount": "100",
  "to": "DEST_SOL_ADDRESS",
  "contractAddress": "0xYourOFTAddress"
}
```

### 3. Li-Fi Bridge Transfer
```