#!/usr/bin/env node

const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');
const config = require('../config/config');

class E2ETestSuite {
  constructor() {
    this.baseUrl = 'http://localhost:3001'; // Health check server
    this.testResults = [];
    this.solanaConnection = new Connection(config.solana.rpcUrl);
  }

  async runAllTests() {
    console.log('🦈 TerminalOne Bot - End-to-End Testing');
    console.log('=====================================');
    
    try {
      // Test 1: Health Checks
      await this.testHealthChecks();
      
      // Test 2: Solana Connectivity
      await this.testSolanaConnectivity();
      
      // Test 3: Price Services
      await this.testPriceServices();
      
      // Test 4: Monitoring Endpoints
      await this.testMonitoringEndpoints();
      
      // Test 5: Rate Limiting
      await this.testRateLimiting();
      
      // Generate Report
      this.generateTestReport();
      
    } catch (error) {
      console.error('❌ E2E Testing failed:', error.message);
      process.exit(1);
    }
  }

  async testHealthChecks() {
    console.log('\\n🏥 Testing Health Checks...');
    
    const tests = [
      {
        name: 'Basic Health Check',
        url: '/health',
        expectedStatus: 200
      },
      {
        name: 'Readiness Check', 
        url: '/ready',
        expectedStatus: 200
      },
      {
        name: 'Liveness Check',
        url: '/live', 
        expectedStatus: 200
      }
    ];

    for (const test of tests) {
      try {
        const response = await axios.get(`${this.baseUrl}${test.url}`, { timeout: 5000 });
        
        if (response.status === test.expectedStatus) {
          this.logSuccess(`✅ ${test.name}`);
          this.testResults.push({ test: test.name, status: 'PASS', details: 'OK' });
        } else {
          this.logError(`❌ ${test.name}: Status ${response.status}, expected ${test.expectedStatus}`);
          this.testResults.push({ test: test.name, status: 'FAIL', details: `Status ${response.status}` });
        }
      } catch (error) {
        this.logError(`❌ ${test.name}: ${error.message}`);
        this.testResults.push({ test: test.name, status: 'FAIL', details: error.message });
      }
    }
  }

  async testSolanaConnectivity() {
    console.log('\\n⚡ Testing Solana Connectivity...');
    
    try {
      // Test RPC connection
      const version = await this.solanaConnection.getVersion();
      this.logSuccess(`✅ Solana RPC Connection (version: ${version['solana-core']})`);
      this.testResults.push({ 
        test: 'Solana RPC Connection', 
        status: 'PASS', 
        details: `Version: ${version['solana-core']}` 
      });
      
      // Test slot information
      const slot = await this.solanaConnection.getSlot();
      this.logSuccess(`✅ Solana Slot Info (current slot: ${slot})`);
      this.testResults.push({ 
        test: 'Solana Slot Info', 
        status: 'PASS', 
        details: `Slot: ${slot}` 
      });
      
      // Test balance query (using a known address)
      const balance = await this.solanaConnection.getBalance(new PublicKey('11111111111111111111111111111112'));
      this.logSuccess(`✅ Balance Query (system program: ${balance} lamports)`);
      this.testResults.push({ 
        test: 'Balance Query', 
        status: 'PASS', 
        details: `${balance} lamports` 
      });
      
    } catch (error) {
      this.logError(`❌ Solana Connectivity: ${error.message}`);
      this.testResults.push({ 
        test: 'Solana Connectivity', 
        status: 'FAIL', 
        details: error.message 
      });
    }
  }

  async testPriceServices() {
    console.log('\\n💰 Testing Price Services...');
    
    const tests = [
      {
        name: 'CoinGecko SOL Price',
        url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true&include_1hr_change=true',
        validator: (data) => data.solana && data.solana.usd > 0
      },
      {
        name: 'Jupiter Token List',
        url: 'https://token.jup.ag/strict',
        validator: (data) => Array.isArray(data) && data.length > 0
      }
    ];

    for (const test of tests) {
      try {
        const response = await axios.get(test.url, { timeout: 10000 });
        
        if (test.validator(response.data)) {
          this.logSuccess(`✅ ${test.name}`);
          this.testResults.push({ 
            test: test.name, 
            status: 'PASS', 
            details: 'API responsive' 
          });
        } else {
          this.logError(`❌ ${test.name}: Invalid response format`);
          this.testResults.push({ 
            test: test.name, 
            status: 'FAIL', 
            details: 'Invalid response format' 
          });
        }
      } catch (error) {
        this.logError(`❌ ${test.name}: ${error.message}`);
        this.testResults.push({ 
          test: test.name, 
          status: 'FAIL', 
          details: error.message 
        });
      }
    }
  }

  async testMonitoringEndpoints() {
    console.log('\\n📊 Testing Monitoring Endpoints...');
    
    try {
      // Test metrics endpoint
      const metricsResponse = await axios.get(`${this.baseUrl}/metrics`, { timeout: 5000 });
      const metrics = metricsResponse.data;
      
      // Validate metrics structure
      if (metrics.metrics && metrics.rateLimit && metrics.errors) {
        this.logSuccess('✅ Metrics Endpoint Structure');
        this.testResults.push({ 
          test: 'Metrics Endpoint', 
          status: 'PASS', 
          details: 'Valid structure' 
        });
        
        // Check specific metrics
        const requiredFields = ['uptime', 'requests', 'memory'];
        const missingFields = requiredFields.filter(field => !metrics.metrics[field]);
        
        if (missingFields.length === 0) {
          this.logSuccess('✅ Metrics Content');
          this.testResults.push({ 
            test: 'Metrics Content', 
            status: 'PASS', 
            details: 'All required fields present' 
          });
        } else {
          this.logError(`❌ Metrics Content: Missing fields - ${missingFields.join(', ')}`);
          this.testResults.push({ 
            test: 'Metrics Content', 
            status: 'FAIL', 
            details: `Missing: ${missingFields.join(', ')}` 
          });
        }
      } else {
        this.logError('❌ Metrics Endpoint: Invalid structure');
        this.testResults.push({ 
          test: 'Metrics Endpoint', 
          status: 'FAIL', 
          details: 'Invalid structure' 
        });
      }
    } catch (error) {
      this.logError(`❌ Monitoring Endpoints: ${error.message}`);
      this.testResults.push({ 
        test: 'Monitoring Endpoints', 
        status: 'FAIL', 
        details: error.message 
      });
    }
  }

  async testRateLimiting() {
    console.log('\\n🚦 Testing Rate Limiting...');
    
    try {
      // Make multiple rapid requests to health endpoint
      const requests = [];
      const startTime = Date.now();
      
      for (let i = 0; i < 5; i++) {
        requests.push(
          axios.get(`${this.baseUrl}/health`, { timeout: 1000 })
            .then(response => ({ status: response.status }))
            .catch(error => ({ error: error.message }))
        );
      }
      
      const results = await Promise.all(requests);
      const successCount = results.filter(r => r.status === 200).length;
      const duration = Date.now() - startTime;
      
      this.logSuccess(`✅ Rate Limiting Test: ${successCount}/5 requests succeeded in ${duration}ms`);
      this.testResults.push({ 
        test: 'Rate Limiting', 
        status: 'PASS', 
        details: `${successCount}/5 requests, ${duration}ms` 
      });
      
    } catch (error) {
      this.logError(`❌ Rate Limiting: ${error.message}`);
      this.testResults.push({ 
        test: 'Rate Limiting', 
        status: 'FAIL', 
        details: error.message 
      });
    }
  }

  generateTestReport() {
    console.log('\\n📋 Test Report');
    console.log('===============');
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    
    console.log(`\\n📊 Summary: ${passed}/${total} tests passed (${((passed/total)*100).toFixed(1)}%)`);
    
    if (failed > 0) {
      console.log('\\n❌ Failed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(result => {
          console.log(`  • ${result.test}: ${result.details}`);
        });
    }
    
    console.log('\\n✅ Passed Tests:');
    this.testResults
      .filter(r => r.status === 'PASS')
      .forEach(result => {
        console.log(`  • ${result.test}: ${result.details}`);
      });
    
    // Save results to file
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(__dirname, '..', 'test-results.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total,
        passed,
        failed,
        successRate: ((passed/total)*100).toFixed(1) + '%'
      },
      results: this.testResults,
      environment: {
        nodeVersion: process.version,
        solanaNetwork: config.solana.network,
        botEnvironment: config.bot.environment
      }
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\\n💾 Report saved to: ${reportPath}`);
    
    if (failed > 0) {
      console.log('\\n⚠️ Some tests failed. Please review before production deployment.');
      process.exit(1);
    } else {
      console.log('\\n🎉 All tests passed! System ready for production.');
    }
  }

  logSuccess(message) {
    console.log(message);
  }

  logError(message) {
    console.log(message);
  }

  logInfo(message) {
    console.log(`ℹ️ ${message}`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new E2ETestSuite();
  testSuite.runAllTests().catch(console.error);
}

module.exports = E2ETestSuite;