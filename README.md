**# Explanation of Sunpath DAO**

SUNPATH DAO uses Solana to crowdsource road condition reporting.  
Drivers earn SOL by videoing roads, helping lower maintenance costs,  
easily onboarding to crypto, and funding safer roads globally.

**# Sunpath DAO Demo**

https://sunpathdao.replit.app/

**# Sunpath DAO Deck**

https://docs.google.com/presentation/d/1Ap8eoM25E24VWcPOhb4LbQSWadRcGeJPXtDUto983AI/edit?usp=sharing

**# Sunpath DAO Presentation**

https://youtu.be/9RD47Yy2Jl4

**# Sunpath DAO Technical Video(LIVE DEMO)**

https://youtu.be/w4f1quJ5J9c

**#Program ID**  
Drr2eM6yoGXL2QZHdaFzXzUDDPQarV8acbbYWTBAtNyE  
https://solscan.io/account/Drr2eM6yoGXL2QZHdaFzXzUDDPQarV8acbbYWTBAtNyE?cluster=devnet

## Features

- Task creation and management
- Task approval and rejection
- Fund management and reclamation
- Solana wallet integration

## Tech Stack

- **Frontend**

  - React
  - TypeScript
  - Tailwind CSS
  - Vite

- **Backend**
  - Solana
  - Anchor Framework
  - Rust

## Setup

1. Clone the repository

```bash
git clone https://github.com/shtt0/sunpathdao-app.git
cd sunpathdao-app
```

2. Install dependencies

```bash
npm install
```

3. Start development server

```bash
npm run dev
```

## Project Structure

```
src/
├── components/
│   ├── buttons/        # Action button components
│   └── common/         # Common components
├── hooks/             # Custom hooks
├── types/             # Type definitions
├── constants/         # Constants
└── pages/             # Page components
```

## Key Components

- `CreateTaskButton`: Create new tasks
- `AcceptTaskButton`: Approve tasks
- `RejectTaskButton`: Reject tasks
- `ReclaimTaskFundsButton`: Reclaim task funds

## Development Requirements

- Node.js v20.18.0 or higher
- Solana CLI
- Anchor Framework

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
