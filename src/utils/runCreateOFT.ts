import { spawn } from 'child_process';

export async function runCreateOFT(args: {
  eid: string,
  programId: string,
  name: string,
  symbol: string,
  amount: string,
  uri: string,
  onlyOftStore?: boolean,
  computeUnitPriceScaleFactor?: string
}): Promise<{ mint: string, mintAuthority: string, escrow: string, oftStore: string }> {
  return new Promise((resolve, reject) => {
    const cliArgs = [
      'hardhat',
      'lz:oft:solana:create',
      '--eid', args.eid,
      '--program-id', args.programId,
      '--name', args.name,
      '--symbol', args.symbol,
      '--amount', args.amount,
      '--uri', args.uri,
      '--only-oft-store', args.onlyOftStore ? 'true' : 'false',
      '--compute-unit-price-scale-factor', args.computeUnitPriceScaleFactor || '200'
    ];

    const child = spawn('pnpm', cliArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      // Auto-respond to known prompts
      if (chunk.includes('You have chosen `--only-oft-store true`') ||
          chunk.includes('Would you like to preview the transactions before continuing?') ||
          chunk.includes('Would you like to submit the required transactions?') ||
          chunk.includes('Continue?') ||
          chunk.includes('(Y/n)')) {
        child.stdin.write('yes\n');
      }
    });
    child.stderr.on('data', (data) => {
      error += data.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        // Find the last JSON object in the output
        const match = output.match(/\{[\s\S]*\}/g);
        if (match) {
          try {
            resolve(JSON.parse(match[match.length - 1]));
          } catch (e) {
            reject(new Error('Failed to parse JSON output: ' + e));
          }
        } else {
          reject(new Error('No JSON output found'));
        }
      } else {
        reject(new Error(error || output));
      }
    });
    child.on('error', (err) => {
      reject(err);
    });
  });
} 