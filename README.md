# Cryptobot Monitor

This project is a dashboard for monitoring via the TuxTrader trading bot, providing real-time updates on trades, portfolio status, and performance metrics.

[![Docker Image Version (latest by date)](https://img.shields.io/docker/v/royen99/cryptobot-monitor?logo=docker)](https://hub.docker.com/r/royen99/cryptobot-monitor)
[![Docker Pulls](https://img.shields.io/docker/pulls/royen99/cryptobot-monitor?logo=docker)](https://hub.docker.com/r/royen99/cryptobot-monitor)
[![CI/CD](https://github.com/royen99/cryptobot-monitor/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/royen99/cryptobot-monitor/actions/workflows/docker-publish.yml)
[![Stars](https://img.shields.io/github/stars/royen99/cryptobot-monitor?logo=github)](https://github.com/royen99/cryptobot-monitor)
[![Multi-Arch Support](https://img.shields.io/badge/arch-linux%2Famd64%20%7C%20linux%2Farm64-blue?logo=docker)](https://hub.docker.com/r/royen99/cryptobot-monitor/tags)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features
✅ Real-time trade updates \
✅ Portfolio status tracking \
✅ Performance metrics visualization \
✅ Responsive design for desktop and mobile \
✅ User-friendly interface \
✅ Simple trade logging \
✅ Allows manual trade execution (buy/sell/cancel)

## Example UI Screenshot
![Example UI Screenshot](https://github.com/royen99/cryptobot-monitor/blob/main/mainview.png?raw=true)

## Installation

### Prerequisites
Since this monitor should work with the Cryptobot-trader, you need to have the trading bot set up and running. Follow the instructions in the [Trader](https://github.com/royen99/cryptobot-trader) repository to get it up and running.

Use the supplied config.json.template file for your database connection settings, and other configurations. \
Make sure to rename it to `config.json` and fill in your details and place it in the appropriate directory (.env by default). 

The `config.json` file uses the exact same format as the Cryptobot-trader (you can also use the same docker volume).

The provided sample Docker Compose file (`docker-compose-sample.yml`) can be used as a starting point. Adjust the configuration as needed for your environment. \
It is also setup to start both the monitor and trader services (modify as needed).

## The easy podman way (Ubuntu)

### Install Podman and Podman Compose:
   ```bash
   sudo apt update
   sudo apt install -y podman podman-compose
   ```

### Setup config files
Create a directory for your environment files:
   ```bash
   mkdir -p cryptotrader && cd cryptotrader
   mkdir -p .env
   ```
Create a `config.json` file in the `.env` directory and fill in your details. You can use the `config.json.template` file as a reference.

If you're starting fresh, ensure that the `init.sql` file is also in your current directory.

### Use the Podman Compose file to start the services:
Note that the `docker-compose-sample.yml` file is compatible with Podman Compose, so you can use it directly and is setup to start all the necessary services (db, trader, monitor) in one go.

   ```bash
   podman-compose -f docker-compose-sample.yml up -d
   ```

### Verify the services are running:
   ```bash
   podman ps
   CONTAINER ID  IMAGE                     COMMAND               CREATED         STATUS         PORTS                   NAMES
   b1b73c377c8e  postgres:15-alpine        postgres              11 seconds ago  Up 11 seconds  0.0.0.0:5432->5432/tcp  db_1
   ed6f6678fbbc  cryptobot-trader:latest   python app/main.p...  8 seconds ago   Up 8 seconds                           trader_1
   7d65ae95c99f  cryptobot-monitor:latest  uvicorn app.main:...  6 seconds ago   Up 5 seconds   0.0.0.0:8080->8080/tcp  monitor_1
   ```

To access the Dashboard, you can access the monitor's web interface at `http://localhost:8080`.

Following up on the trading bot's output, use podman's log option:

```bash
podman logs -f trader_1
💰 Available Balances:
  - ETH: 1.4173876
  - XRP: 102.0
  - USDC: 730.50
📉 ETH Falling Streak: 2
🚀 ETH - Current Price: $4398.81 (-3.72%), Peak Price: $4627.26, Trailing Stop Price: $4580.99
📊  - ETH Avg buy price: None | Slope: -6.799999999999272 | Performance - Total Trades: 47 | Total Profit: $31.05
📉 XRP Falling Streak: 2
🚀 XRP - Current Price: $3.1388 (-1.99%), Peak Price: $3.1573, Trailing Stop Price: $3.1415
📊  - XRP Avg buy price: 3.089442811908925 | Slope: -0.0026000000000001577 | Performance - Total Trades: 134 | Total Profit: $62.28
```

### Docker Way

1. Use the Docker Compose file to start the services:
   ```bash
   docker-compose -f docker-compose-sample.yml up -d
   ```

2. Run the Monitor Docker container directly:
   ```bash
   docker run -d --name cryptobot-monitor -p 8080:8080 royen99/cryptobot-monitor:latest
   ```

## Supported Platforms  

✅ **Mac (Intel/Apple Silicon)**  
✅ **Linux (AMD64/ARM64)**  
✅ **Raspberry Pi (ARMv7/ARM64)**  (Tested on Raspberry Pi 4 Model B/Ubuntu 24.04.3 LTS)


## Donations
If you find this project useful and would like to support its development, consider making a donation:

- BTC: `bc1qy5wu6vrxpclycl2y0wgnjjdxfd2qde7xemphgt`
- ETH: `0xe9128E8cc47bCab918292E2a0aE0C25971bb61EA`
- SOL: `ASwSbGHvcvebyPEUJRoE9aq3b2H2oJSaM7GsZAt83bjR`
- Via [CoinBase](https://commerce.coinbase.com/checkout/00370bad-7220-4115-b15f-cda931756c6a)
