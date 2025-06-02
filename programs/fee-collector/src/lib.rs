use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

declare_id!("DM9ddjxyyqHrQDChNSkuhW7gMHKJgutCeHPej2oTGXPW");

#[program]
pub mod fee_collector {
    use super::*;

    pub fn collect_fee(
        ctx: Context<CollectFee>,
        amount: u64,
    ) -> Result<()> {
        // Create the transfer instruction
        let transfer_instruction = system_instruction::transfer(
            &ctx.accounts.from.key(),
            &ctx.accounts.to.key(),
            amount,
        );

        // Execute the transfer
        anchor_lang::solana_program::program::invoke(
            &transfer_instruction,
            &[
                ctx.accounts.from.to_account_info(),
                ctx.accounts.to.to_account_info(),
            ],
        )?;

        // Emit event for tracking
        emit!(FeeCollected {
            from: ctx.accounts.from.key(),
            to: ctx.accounts.to.key(),
            amount,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CollectFee<'info> {
    /// CHECK: This is the account that will pay the fee
    #[account(mut)]
    pub from: Signer<'info>,
    
    /// CHECK: This is the account that will receive the fee
    #[account(mut)]
    pub to: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event]
pub struct FeeCollected {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}
