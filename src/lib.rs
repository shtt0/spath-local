use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::{invoke, invoke_signed},
    system_instruction,
};
use std::fmt;

// プログラムIDを更新
declare_id!("Drr2eM6yoGXL2QZHdaFzXzUDDPQarV8acbbYWTBAtNyE");

#[program]
pub mod sunpath {
    use super::*;

    pub fn initialize_program(
        ctx: Context<InitializeProgram>,
        admin: Pubkey,
        dao_treasury_address: Pubkey,
        governance_token_mint: Pubkey,
        minimum_reward_amount: u64,
        dao_fee_percentage: u8,
        denial_penalty_duration: i64,
        patroller_governance_token_amount: u64,
    ) -> Result<()> {
        msg!("--- initializeProgram instruction started ---");
        let config = &mut ctx.accounts.config;
        config.admin = admin;
        config.dao_treasury_address = dao_treasury_address;
        config.governance_token_mint = governance_token_mint;
        config.minimum_reward_amount = minimum_reward_amount;
        config.dao_fee_percentage = dao_fee_percentage;
        config.denial_penalty_duration = denial_penalty_duration;
        config.patroller_governance_token_amount = patroller_governance_token_amount;
        config.is_initialized = true;
        msg!(
            "Program initialized! Admin: {}, Denial penalty duration: {}",
            admin,
            denial_penalty_duration
        );
        msg!("--- initializeProgram instruction finished successfully ---");
        Ok(())
    }

    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: u64,
        reward_amount: u64,
        duration_seconds: i64,
    ) -> Result<()> {
        msg!("--- createTask instruction started ---");
        msg!(
            "Task ID: {}, Reward Amount: {}, Duration: {}s",
            task_id,
            reward_amount,
            duration_seconds
        );

        let task_account = &mut ctx.accounts.task_account;
        let consigner = &ctx.accounts.consigner;
        let system_program = &ctx.accounts.system_program;
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        msg!("Consigner: {}", consigner.key());
        msg!("TaskAccount PDA to be created: (derived from seeds)");
        msg!(
            "Config minimum_reward_amount: {}",
            config.minimum_reward_amount
        );

        require!(
            reward_amount >= config.minimum_reward_amount,
            SunpathError::RewardAmountTooLow
        );
        msg!("Reward amount check passed.");

        let transfer_instruction = system_instruction::transfer(
            consigner.to_account_info().key,
            task_account.to_account_info().key,
            reward_amount,
        );
        msg!("Transfer instruction created for locking reward.");

        invoke(
            &transfer_instruction,
            &[
                consigner.to_account_info(),
                task_account.to_account_info(),
                system_program.to_account_info(),
            ],
        )?;
        msg!(
            "Reward {} lamports locked into TaskAccount PDA {}.",
            reward_amount,
            task_account.key()
        );

        task_account.task_id = task_id;
        task_account.consigner_wallet = consigner.key();
        task_account.reward_amount_locked = reward_amount;
        task_account.creation_timestamp = clock.unix_timestamp;
        task_account.duration_seconds = duration_seconds;
        task_account.expiration_timestamp = clock
            .unix_timestamp
            .checked_add(duration_seconds)
            .ok_or(SunpathError::TimestampOverflow)?;
        task_account.status = TaskStatus::Open;
        task_account.status_update_timestamp = clock.unix_timestamp;
        task_account.is_initialized = true;

        msg!(
            "Task {} created and initialized. Expiration: {}",
            task_id,
            task_account.expiration_timestamp
        );
        msg!("--- createTask instruction finished successfully ---");
        Ok(())
    }

    pub fn accept_task(ctx: Context<AcceptTask>, recipient: Pubkey) -> Result<()> {
        msg!("--- acceptTask instruction started ---");
        msg!("Recipient Arg: {}", recipient);

        let task_account = &mut ctx.accounts.task_account;
        let consigner_wallet_signer = &ctx.accounts.consigner_wallet;
        let system_program = &ctx.accounts.system_program;
        let admin_action_counter = &mut ctx.accounts.admin_action_counter;
        let clock = Clock::get()?;

        msg!("TaskAccount PDA: {}", task_account.key());
        msg!(
            "TaskAccount's original consigner_wallet: {}",
            task_account.consigner_wallet
        );
        msg!(
            "Signer (ctx.accounts.consigner_wallet): {}",
            consigner_wallet_signer.key()
        );
        msg!("TaskAccount current status: {:?}", task_account.status);
        msg!(
            "TaskAccount expiration_timestamp: {}",
            task_account.expiration_timestamp
        );
        msg!("Current clock unix_timestamp: {}", clock.unix_timestamp);
        msg!(
            "Recipient account for payment: {}",
            ctx.accounts.recipient_account.key()
        );
        msg!("AdminActionCounter PDA: {}", admin_action_counter.key());

        require_eq!(
            task_account.status,
            TaskStatus::Open,
            SunpathError::TaskNotOpen
        );
        msg!("Status check passed: Task is Open.");

        require!(
            clock.unix_timestamp <= task_account.expiration_timestamp,
            SunpathError::TaskExpired
        );
        msg!("Expiration check passed: Task is not expired.");

        let amount_to_transfer = task_account.reward_amount_locked;
        msg!("Amount to transfer: {}", amount_to_transfer);
        msg!(
            "TaskAccount PDA lamports BEFORE transfer (approx): {}",
            task_account.to_account_info().lamports()
        );

        let seeds = &[
            b"task_account".as_ref(),
            task_account.consigner_wallet.as_ref(),
            &task_account.task_id.to_le_bytes(),
            &[ctx.bumps.task_account],
        ];
        let signer_seeds = &[&seeds[..]];
        msg!("Signer seeds prepared for invoke_signed.");

        let transfer_instruction = system_instruction::transfer(
            task_account.to_account_info().key,
            &recipient,
            amount_to_transfer,
        );
        msg!(
            "Transfer instruction created. From: {}, To: {}, Amount: {}",
            task_account.key(),
            recipient,
            amount_to_transfer
        );

        invoke_signed(
            &transfer_instruction,
            &[
                task_account.to_account_info(),
                ctx.accounts.recipient_account.to_account_info(),
                system_program.to_account_info(),
            ],
            signer_seeds,
        )?;
        msg!("invoke_signed for reward transfer successful.");

        task_account.status = TaskStatus::Approved;
        task_account.status_update_timestamp = clock.unix_timestamp;
        task_account.assigned_reporter = Some(recipient);
        msg!("Task status updated to Approved.");

        admin_action_counter.admin = consigner_wallet_signer.key();
        admin_action_counter.accept_count = admin_action_counter
            .accept_count
            .checked_add(1)
            .ok_or(SunpathError::CounterOverflow)?;
        msg!(
            "Consigner accept_count for {}: {}",
            consigner_wallet_signer.key(),
            admin_action_counter.accept_count
        );
        msg!("--- acceptTask instruction finished successfully ---");
        Ok(())
    }

    pub fn reject_task(ctx: Context<RejectTask>) -> Result<()> {
        msg!("--- rejectTask instruction started ---");
        let task_account = &mut ctx.accounts.task_account;
        let consigner_wallet_signer = &ctx.accounts.consigner_wallet;
        let admin_action_counter = &mut ctx.accounts.admin_action_counter;
        let clock = Clock::get()?;

        msg!("TaskAccount PDA: {}", task_account.key());
        msg!(
            "TaskAccount's original consigner_wallet: {}",
            task_account.consigner_wallet
        );
        msg!(
            "Signer (ctx.accounts.consigner_wallet): {}",
            consigner_wallet_signer.key()
        );
        msg!("TaskAccount current status: {:?}", task_account.status);
        msg!(
            "TaskAccount expiration_timestamp: {}",
            task_account.expiration_timestamp
        );
        msg!("Current clock unix_timestamp: {}", clock.unix_timestamp);
        msg!("AdminActionCounter PDA: {}", admin_action_counter.key());

        require_eq!(
            task_account.status,
            TaskStatus::Open,
            SunpathError::TaskNotOpen
        );
        msg!("Status check passed: Task is Open.");

        require!(
            clock.unix_timestamp <= task_account.expiration_timestamp,
            SunpathError::TaskExpired
        );
        msg!("Expiration check passed: Task is not expired.");

        task_account.status = TaskStatus::Rejected;
        task_account.status_update_timestamp = clock.unix_timestamp;
        msg!(
            "Task {} status updated to Rejected. Timestamp: {}",
            task_account.task_id,
            task_account.status_update_timestamp
        );

        admin_action_counter.admin = consigner_wallet_signer.key();
        admin_action_counter.reject_count = admin_action_counter
            .reject_count
            .checked_add(1)
            .ok_or(SunpathError::CounterOverflow)?;
        msg!(
            "Consigner reject_count for {}: {}",
            consigner_wallet_signer.key(),
            admin_action_counter.reject_count
        );
        msg!("--- rejectTask instruction finished successfully ---");
        Ok(())
    }

    pub fn reclaim_task_funds(ctx: Context<ReclaimTaskFunds>) -> Result<()> {
        msg!("--- reclaimTaskFunds instruction started ---");

        let task_account = &mut ctx.accounts.task_account;
        let consigner = &ctx.accounts.consigner_wallet;
        let config = &ctx.accounts.config;
        let system_program = &ctx.accounts.system_program;
        let clock = Clock::get()?;

        msg!("TaskAccount PDA: {}", task_account.key());
        msg!(
            "TaskAccount consigner_wallet (from data): {}",
            task_account.consigner_wallet
        );
        msg!(
            "Signer (ctx.accounts.consigner_wallet - should match above): {}",
            consigner.key()
        );
        msg!("TaskAccount current status: {:?}", task_account.status);
        msg!(
            "TaskAccount reward_amount_locked: {}",
            task_account.reward_amount_locked
        );
        msg!(
            "TaskAccount status_update_timestamp: {}",
            task_account.status_update_timestamp
        );
        msg!(
            "TaskAccount expiration_timestamp: {}",
            task_account.expiration_timestamp
        );
        msg!(
            "Config denial_penalty_duration: {}",
            config.denial_penalty_duration
        );
        msg!("Current clock unix_timestamp: {}", clock.unix_timestamp);

        let amount_to_reclaim = task_account.reward_amount_locked;
        msg!("Amount to reclaim: {}", amount_to_reclaim);
        if amount_to_reclaim == 0 {
            msg!("No funds to reclaim (reward_amount_locked is 0).");
        }
        let mut can_reclaim = false;

        if task_account.status == TaskStatus::Rejected {
            msg!("Task status is Rejected. Checking denial penalty duration.");
            let reclaim_allowed_at = task_account
                .status_update_timestamp
                .checked_add(config.denial_penalty_duration)
                .ok_or(SunpathError::TimestampOverflow)?;
            msg!(
                "Reclaim allowed at timestamp: {}. Current timestamp: {}",
                reclaim_allowed_at,
                clock.unix_timestamp
            );
            if clock.unix_timestamp >= reclaim_allowed_at {
                can_reclaim = true;
                msg!("Denial penalty duration passed. Funds can be reclaimed.");
            } else {
                msg!("Denial lockup period is still active. Cannot reclaim yet.");
                return err!(SunpathError::DenialLockupActive);
            }
        } else if task_account.status == TaskStatus::Open
            && clock.unix_timestamp > task_account.expiration_timestamp
        {
            can_reclaim = true;
            msg!("Task is Open and expired. Funds can be reclaimed.");
        } else {
            msg!(
                "Task status is not eligible for reclaim. Current status: {:?}",
                task_account.status
            );
        }

        require!(can_reclaim, SunpathError::CannotReclaimFunds);
        msg!("Reclaim condition met.");

        let seeds = &[
            b"task_account".as_ref(),
            task_account.consigner_wallet.as_ref(),
            &task_account.task_id.to_le_bytes(),
            &[ctx.bumps.task_account],
        ];
        let signer_seeds = &[&seeds[..]];
        msg!("Signer seeds prepared for invoke_signed.");

        let transfer_instruction = system_instruction::transfer(
            task_account.to_account_info().key,
            consigner.to_account_info().key,
            amount_to_reclaim,
        );
        msg!(
            "Transfer instruction created. From: {}, To: {}, Amount: {}",
            task_account.key(),
            consigner.key(),
            amount_to_reclaim
        );

        invoke_signed(
            &transfer_instruction,
            &[
                task_account.to_account_info(),
                consigner.to_account_info(),
                system_program.to_account_info(),
            ],
            signer_seeds,
        )?;
        msg!("invoke_signed for fund reclamation successful.");

        task_account.status = TaskStatus::Reclaimed;
        task_account.status_update_timestamp = clock.unix_timestamp;
        task_account.reward_amount_locked = 0;
        msg!("Task status updated to Reclaimed. Reward amount locked set to 0.");
        msg!("--- reclaimTaskFunds instruction finished successfully ---");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeProgram<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + ProgramConfig::LEN,
        seeds = [b"config_v2"],
        bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct CreateTask<'info> {
    #[account(
        init,
        payer = consigner,
        space = 8 + TaskAccount::LEN,
        seeds = [b"task_account", consigner.key().as_ref(), &task_id.to_le_bytes()],
        bump
    )]
    pub task_account: Account<'info, TaskAccount>,
    #[account(mut)]
    pub consigner: Signer<'info>,
    #[account(seeds = [b"config_v2"], bump)]
    pub config: Account<'info, ProgramConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptTask<'info> {
    #[account(
        mut,
        seeds = [b"task_account", task_account.consigner_wallet.as_ref(), &task_account.task_id.to_le_bytes()],
        bump,
        has_one = consigner_wallet @ SunpathError::NotTaskConsigner,
    )]
    pub task_account: Account<'info, TaskAccount>,
    #[account(mut)]
    pub consigner_wallet: Signer<'info>,
    /// CHECK: recipient account, SOL transferred here.
    #[account(mut)]
    pub recipient_account: AccountInfo<'info>,
    #[account(seeds = [b"config_v2"], bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        init_if_needed,
        payer = consigner_wallet,
        space = 8 + AdminActionCounter::LEN,
        seeds = [b"admin_counter", consigner_wallet.key().as_ref()],
        bump
    )]
    pub admin_action_counter: Account<'info, AdminActionCounter>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RejectTask<'info> {
    #[account(
        mut,
        seeds = [b"task_account", task_account.consigner_wallet.as_ref(), &task_account.task_id.to_le_bytes()],
        bump,
        has_one = consigner_wallet @ SunpathError::NotTaskConsigner,
    )]
    pub task_account: Account<'info, TaskAccount>,
    #[account(mut)]
    pub consigner_wallet: Signer<'info>,
    #[account(seeds = [b"config_v2"], bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        init_if_needed,
        payer = consigner_wallet,
        space = 8 + AdminActionCounter::LEN,
        seeds = [b"admin_counter", consigner_wallet.key().as_ref()],
        bump
    )]
    pub admin_action_counter: Account<'info, AdminActionCounter>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReclaimTaskFunds<'info> {
    #[account(
        mut,
        seeds = [b"task_account", task_account.consigner_wallet.as_ref(), &task_account.task_id.to_le_bytes()],
        bump,
        has_one = consigner_wallet @ SunpathError::NotConsigner,
    )]
    pub task_account: Account<'info, TaskAccount>,
    #[account(mut)]
    pub consigner_wallet: Signer<'info>,
    #[account(seeds = [b"config_v2"], bump)]
    pub config: Account<'info, ProgramConfig>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct ProgramConfig {
    pub admin: Pubkey,
    pub dao_treasury_address: Pubkey,
    pub governance_token_mint: Pubkey,
    pub minimum_reward_amount: u64,
    pub dao_fee_percentage: u8,
    pub denial_penalty_duration: i64,
    pub patroller_governance_token_amount: u64,
    pub is_initialized: bool,
}

impl ProgramConfig {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 1 + 8 + 8 + 1;
}

#[account]
pub struct TaskAccount {
    pub task_id: u64,
    pub consigner_wallet: Pubkey,
    pub reward_amount_locked: u64,
    pub creation_timestamp: i64,
    pub duration_seconds: i64,
    pub expiration_timestamp: i64,
    pub status: TaskStatus,
    pub status_update_timestamp: i64,
    pub assigned_reporter: Option<Pubkey>,
    pub report_pda: Option<Pubkey>,
    pub is_initialized: bool,
}

impl TaskAccount {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + 1 + 8 + (1 + 32) + (1 + 32) + 1;
}

#[account]
#[derive(Default)]
pub struct AdminActionCounter {
    pub admin: Pubkey,
    pub accept_count: u64,
    pub reject_count: u64,
}

impl AdminActionCounter {
    pub const LEN: usize = 32 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskStatus {
    Open,
    Approved,
    Rejected,
    Expired,
    Reclaimed,
}

impl fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[error_code]
pub enum SunpathError {
    #[msg("Reward amount is too low.")]
    RewardAmountTooLow,
    #[msg("Timestamp calculation resulted in an overflow.")]
    TimestampOverflow,
    #[msg("The signer is not the admin.")]
    NotAdmin,
    #[msg("The task is not in an open state for this operation.")]
    TaskNotOpen,
    #[msg("The task has already expired.")]
    TaskExpired,
    #[msg("The signer is not the consigner of this task.")]
    NotConsigner,
    #[msg("Funds cannot be reclaimed yet.")]
    CannotReclaimFunds,
    #[msg("Denial lockup period is still active.")]
    DenialLockupActive,
    #[msg("Counter overflow.")]
    CounterOverflow,
    #[msg("The signer is not the task consigner.")]
    NotTaskConsigner,
}
