# FarmConnect Ghana

A USSD + lightweight web platform connecting smallholder farmers directly to urban aggregators, restaurants, and school feeding programs — reducing the 30–40% post-harvest spoilage that plagues Ghana's agricultural supply chain.

**No smartphone required.** Farmers interact entirely via USSD (`*920*88#`) and SMS on any feature phone.

## The Problem

- Ghana loses **30–40% of produce** to spoilage before reaching market
- Farmers have **no visibility into demand** and sell below value to roadside middlemen
- **Last-mile transport** costs eat into already thin margins

## The Solution

| Feature | Channel | Who |
|---------|---------|-----|
| Real-time market prices | USSD + SMS | Farmers |
| Order-ahead (demand signals) | USSD + Web | Farmers + Buyers |
| Harvest commitment | USSD | Farmers |
| Shared transport booking | USSD + SMS | Farmers |
| Post demand orders | Web (lightweight) | Aggregators, restaurants, schools |
| Price dashboard | Web | Everyone |

## Quick Start

```bash
npm install
npm run seed    # Load sample farmers, buyers, prices, orders
npm start       # Start server on port 3000
```

Open:
- **Web dashboard:** http://localhost:3000
- **USSD simulator:** http://localhost:3000/ussd-simulator
- **Place orders:** http://localhost:3000/buyer.html
- **Market prices:** http://localhost:3000/prices.html

## USSD Menu (*920*88#)

```
FarmConnect Ghana
1. Today's Prices        → See market rates vs roadside offers
2. Buyer Orders          → Order-ahead: accept buyer demand
3. Commit Harvest        → Signal upcoming harvest to buyers
4. My Commitments        → View your scheduled harvests
5. Shared Transport      → Book space on pooled delivery runs
6. Register / Profile    → Farmer registration
7. Help
```

## SMS Commands

| Command | Action |
|---------|--------|
| `PRICES` | Quick price check for top crops |
| `CONFIRM` | Confirm transport booking |
| `HELP` | Show available commands |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/prices` | Live prices by crop and market |
| GET | `/api/prices/summary` | Aggregated price summary |
| GET | `/api/orders` | List buyer orders |
| POST | `/api/orders` | Create order (notifies farmers via SMS) |
| GET | `/api/commitments` | Harvest commitments |
| GET | `/api/transport` | Shared transport runs |
| POST | `/ussd` | USSD webhook (Africa's Talking compatible) |
| POST | `/sms/inbound` | Inbound SMS handler |

## Architecture

```
┌─────────────┐     USSD/SMS      ┌──────────────┐
│  Feature    │ ────────────────► │   Express    │
│  Phones     │                   │   Backend    │
└─────────────┘                   │   (Node.js)  │
                                  │              │
┌─────────────┐     HTTP/API      │   SQLite DB  │
│  Lightweight│ ────────────────► │              │
│  Web App    │                   └──────────────┘
└─────────────┘
     Buyers: aggregators, restaurants, school feeding programs
```

## Production Deployment

For production in Ghana, integrate with:

- **Africa's Talking** or **Hubtel** for USSD gateway and SMS delivery
- **MTN/Vodafone/AirtelTigo** USSD shortcode provisioning
- Set `PORT` environment variable for hosting (Railway, Render, etc.)

### Africa's Talking USSD Webhook

Point your USSD service URL to `https://your-domain.com/ussd` — the handler accepts standard AT POST parameters (`sessionId`, `phoneNumber`, `text`).

## Test Accounts (after seeding)

**Farmers** (use in USSD simulator):
- Kwame Asante: `0241111001` (Eastern)
- Ama Osei: `0241111002` (Ashanti)

**Buyers** (use in order form):
- Fresh Foods Aggregator
- Junction Lounge Restaurant
- Cape Coast Primary School

## License

MIT
