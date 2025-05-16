# LayerZero Omni-Chain Token (OFT) Deployment

This project demonstrates how to deploy and manage Omni-Chain Tokens (OFTs) using LayerZero's cross-chain messaging protocol. The implementation allows for token transfers between different blockchain networks, including Arbitrum Sepolia, BSC Testnet, and Solana Testnet.

## Prerequisites

- Node.js (v18 or higher)
- pnpm package manager
- MetaMask or another Web3 wallet
- Testnet ETH for gas fees
- Solana CLI tools (for Solana operations)

## Project Structure

```
.
├── contracts/           # Smart contract implementations
├── deploy/             # Deployment scripts
├── tasks/              # Hardhat tasks
├── server.ts           # API server for token creation
└── layerzero.config.ts # LayerZero configuration
```

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Configure environment variables:
Create a `.env` file with the following variables:
```
PRIVATE_KEY=your_private_key
SOLANA_PRIVATE_KEY=your_solana_private_key
```

## Supported Networks

The project currently supports the following testnet networks:

- Arbitrum Sepolia (Endpoint ID: 40168)
- BSC Testnet (Endpoint ID: 40102)
- Solana Testnet (Endpoint ID: 40231)

## Deployment Steps

### 1. Start the Server

```bash
pnpm ts-node server.ts
```

### 2. Create a New Token

Send a POST request to create a new token:

```bash
curl -X POST http://localhost:3000/api/create-token \
  -H "Content-Type: application/json" \
  -d '{
    "mintName": "MyOFT",
    "mintSymbol": "MOFT",
    "totalTokens": "1000000",
    "mintUri": "https://example.com/token",
    "destinationChains": ["arbitrum-sepolia", "bsc-v2-testnet"]
  }'
```

The deployment process consists of four main steps:

1. **Solana OFT Creation**
   - Creates the initial token on Solana
   - Sets up the OFT store account
   - Configures token metadata

2. **EVM Chain Deployment**
   - Deploys the OFT contract on specified EVM chains
   - Configures cross-chain messaging parameters
   - Sets up token metadata on each chain

3. **Configuration Update**
   - Updates the LayerZero configuration
   - Sets up enforced options for cross-chain messaging
   - Configures gas limits and execution parameters

4. **Configuration Wiring**
   - Establishes connections between chains
   - Sets up message passing routes
   - Configures security parameters

## Contract Addresses

After successful deployment, the contracts will be deployed on each specified network. The deployment process will output the contract addresses for:
- Solana OFT Store
- EVM chain OFT contracts

These addresses will be used for cross-chain token transfers and should be saved for future reference.

## Cross-Chain Messaging Configuration

The project uses the following enforced options for cross-chain messaging:

### EVM Chains
```typescript
{
    msgType: 1,
    optionType: ExecutorOptionType.LZ_RECEIVE,
    gas: 80000,
    value: 0
}
```

### Solana
```typescript
{
    msgType: 1,
    optionType: ExecutorOptionType.LZ_RECEIVE,
    gas: 200000,
    value: 2500000
}
```

## Error Handling

The deployment process includes automatic retry mechanisms for:
- Transaction expiration errors
- Network connectivity issues
- Gas estimation failures

Each step is tracked and reported in the response, allowing for easy debugging and progress monitoring.

## Security Considerations

1. **Private Keys**: Never commit private keys to the repository
2. **Gas Limits**: Configure appropriate gas limits for each network
3. **Access Control**: Implement proper access control for token operations
4. **Cross-Chain Security**: Verify message authenticity on receiving chains

## Testing

To test cross-chain transfers:

1. Deploy the token on multiple chains
2. Configure the connections using the LayerZero config
3. Test token transfers between chains
4. Verify token balances on each chain

## Troubleshooting

Common issues and solutions:

1. **Transaction Failures**
   - Check gas limits
   - Verify network connectivity
   - Ensure sufficient funds for gas

2. **Cross-Chain Message Failures**
   - Verify endpoint configurations
   - Check enforced options
   - Validate message parameters

3. **Deployment Issues**
   - Check network configurations
   - Verify contract bytecode
   - Ensure proper initialization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 