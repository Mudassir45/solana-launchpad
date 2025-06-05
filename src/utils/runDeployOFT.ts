import { spawn } from 'child_process';

export async function runDeployOFT(args: {
  network: string,
  name: string,
  symbol: string,
  decimals?: string
}): Promise<{ address: string, name: string, symbol: string, decimals: string, deployer: string }> {
  return new Promise((resolve, reject) => {
    const cliArgs = [
      'hardhat',
      'deploy-oft',
      '--network', args.network,
      '--name', args.name,
      '--symbol', args.symbol
    ];
    if (args.decimals) {
      cliArgs.push('--decimals', args.decimals);
    }

    console.log('Running command:', 'npx', cliArgs.join(' '));

    const child = spawn('npx', cliArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log('Deploy OFT stdout:', chunk);
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      error += chunk;
      console.error('Deploy OFT stderr:', chunk);
    });

    child.on('close', (code) => {
      console.log('Command exited with code:', code);
      
      if (code === 0) {
        try {
          // Extract the contract address from the output
          const addressMatch = output.match(/Deployed MyOFT: (0x[a-fA-F0-9]{40})/);
          if (!addressMatch) {
            throw new Error('Could not find contract address in output');
          }

          const result = {
            address: addressMatch[1],
            name: args.name,
            symbol: args.symbol,
            decimals: args.decimals || '18',
            deployer: '' // We don't have the deployer address in the output
          };

          resolve(result);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Failed to parse deployment output. Raw output:', output);
          reject(new Error(`Failed to parse deployment output: ${errorMessage}. Raw output: ${output}`));
        }
      } else {
        reject(new Error(`Deployment failed with code ${code}. Error: ${error || output}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start deployment process: ${err.message}`));
    });
  });
} 