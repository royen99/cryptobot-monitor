# Cryptobot Monitor

This project is a dashboard for monitoring via the TuxTrader trading bot, providing real-time updates on trades, portfolio status, and performance metrics.

[![Docker Image Version (latest by date)](https://img.shields.io/docker/v/royen99/cryptobot-monitor?logo=docker)](https://hub.docker.com/r/royen99/cryptobot-monitor)
[![Docker Pulls](https://img.shields.io/docker/pulls/royen99/cryptobot-monitor?logo=docker)](https://hub.docker.com/r/royen99/cryptobot-monitor)
[![CI/CD](https://github.com/royen99/cryptobot-monitor/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/royen99/cryptobot-monitor/actions/workflows/docker-publish.yml)
[![Stars](https://img.shields.io/github/stars/royen99/cryptobot-monitor?logo=github)](https://github.com/royen99/cryptobot-monitor)
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

1. Use the Docker Compose file to start the services:
   ```bash
   docker-compose -f docker-compose-sample.yml up -d
   ```

2. Run the Docker container directly:
   ```bash
   docker run -d --name cryptobot-monitor -p 8080:8080 royen99/cryptobot-monitor:latest
   ```

## Donations
If you find this project useful and would like to support its development, consider making a donation:

- BTC: `bc1qy5wu6vrxpclycl2y0wgnjjdxfd2qde7xemphgt`
- ETH: `0xe9128E8cc47bCab918292E2a0aE0C25971bb61EA`
- SOL: `ASwSbGHvcvebyPEUJRoE9aq3b2H2oJSaM7GsZAt83bjR`
- Via [CoinBase](https://commerce.coinbase.com/checkout/00370bad-7220-4115-b15f-cda931756c6a)
