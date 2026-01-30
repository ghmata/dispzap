const config = require('../../../config.json');

class ComplianceEngine {
  constructor() {
    this.minDelay = config.compliance.minDelay || 30000;
    this.maxDelay = config.compliance.maxDelay || 90000;
  }

  setDelayRange({ minDelay, maxDelay } = {}) {
    if (Number.isFinite(minDelay)) {
      this.minDelay = minDelay;
    }
    if (Number.isFinite(maxDelay)) {
      this.maxDelay = maxDelay;
    }
    if (this.maxDelay < this.minDelay) {
      const temp = this.minDelay;
      this.minDelay = this.maxDelay;
      this.maxDelay = temp;
    }
  }

  /**
   * Generates a random delay using Box-Muller transform for Normal Distribution.
   * This simulates human behavior better than flat random.
   */
  getVariableDelay() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) num = this.getVariableDelay(); // Resample
    
    const range = this.maxDelay - this.minDelay;
    return Math.floor(this.minDelay + (num * range));
  }

  /**
   * Calculates typing time based on message length.
   * ~100ms per char is average human speed.
   */
  getTypingDelay(message) {
    const charDelay = 100 + (Math.random() * 50); // 100-150ms per char
    const baseTyping = message.length * charDelay;
    // Cap at 15 seconds to not look weird
    return Math.min(baseTyping, 15000); 
  }
}

module.exports = ComplianceEngine;
