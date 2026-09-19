import { test, expect } from '@playwright/test';
import { computeMonthsFromAmount, generateOrderCode } from '../src/lib/vipOrders';

test.describe('VIP Orders Logic', () => {
  test('computeMonthsFromAmount calculates correct months', () => {
    // Under minimum
    expect(computeMonthsFromAmount(10_000)).toBe(0);
    
    // Exactly 1 month
    expect(computeMonthsFromAmount(19_000)).toBe(1);
    
    // 2 months
    expect(computeMonthsFromAmount(38_000)).toBe(2);
    
    // 10 months (190k)
    expect(computeMonthsFromAmount(190_000)).toBe(10);
    
    // Exactly 1 year (199k)
    expect(computeMonthsFromAmount(199_000)).toBe(12);
    
    // 1 year + 1 month (199k + 19k = 218k)
    expect(computeMonthsFromAmount(218_000)).toBe(13);
    
    // 2 years (398k)
    expect(computeMonthsFromAmount(398_000)).toBe(24);
  });

  test('generateOrderCode creates valid codes', () => {
    const code1 = generateOrderCode();
    const code2 = generateOrderCode();
    
    expect(code1).toMatch(/^VNS[A-Z2-9]{6}$/);
    expect(code2).toMatch(/^VNS[A-Z2-9]{6}$/);
    expect(code1).not.toBe(code2); // Low collision probability
  });
});

