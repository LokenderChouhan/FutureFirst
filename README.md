# Stock Market Visualization

A real-time stock market visualization application built with TypeScript and D3.js. This application provides interactive charts for tracking stock prices with various visualization options and technical indicators.

## Features

- **Multiple Chart Types**
  - Line chart with area fill
  - Candlestick chart
  - Real-time price updates
  - Interactive zoom and pan

- **Technical Indicators**
  - Simple Moving Average (SMA) with customizable periods
  - Price indicators
  - Grid lines for better readability

- **Stock Information**
  - Real-time price updates
  - OHLCV (Open, High, Low, Close, Volume) data
  - Price change and percentage change indicators
  - Stock symbol selection

- **Timeframe Options**
  - Multiple timeframe selections
  - Dynamic data updates

- **Interactive Features**
  - Tooltip with detailed price information
  - Zoom and pan capabilities
  - Live data updates
  - Mock data mode for testing

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd [repository-name]
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Build the project:
```bash
npm run build
# or
yarn build
```

## Usage

1. Start the development server:
```bash
npm run dev
# or
yarn dev
```

2. Open your browser and navigate to `http://localhost:3000` (or the port specified in your configuration)

3. Use the interface to:
   - Select different stocks
   - Choose chart types (line or candlestick)
   - Adjust timeframes
   - Toggle SMA indicator
   - Enable/disable live updates
   - Switch between real and mock data

## Project Structure

```
src/
├── ts/
│   ├── main.ts         # Main application logic
│   ├── types.ts        # TypeScript type definitions
│   ├── api.ts          # API integration
│   └── helper.ts       # Utility functions
├── css/               # Stylesheets
└── assets/           # Static assets
```

## Technologies Used

- TypeScript
- D3.js for data visualization
- HTML5/CSS3
- Modern JavaScript (ES6+)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- D3.js community for the excellent visualization library
- Alpha Vantage API for stock market data 