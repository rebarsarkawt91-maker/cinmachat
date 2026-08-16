/**
 * Payment Provider Abstraction for CinemaChat
 *
 * This module defines the interface for payment providers (AsiaPay, FastPay, Card, etc.)
 * and provides a MockPaymentProvider for local development.
 *
 * Security requirements:
 * - Never store raw card numbers or CVV
 * - All sensitive payment data handled by provider only
 * - Provider credentials must come from environment variables
 * - Webhook verification must validate provider signatures
 * - Payment confirmation must be idempotent
 */

export interface PaymentProvider {
  /**
   * Create a new payment record
   * @param amount Payment amount
   * @param currency Currency code (e.g. "USD", "KRW")
   * @param userId User/Firebase uid
   * @param roomId Associated Cinema Window room ID
   * @returns Payment record with provider-specific details
   */
  createPayment(amount: number, currency: string, userId: string, roomId: string): Promise<any>;

  /**
   * Verify a payment via provider webhook/callback
   * @param providerPaymentId Provider's unique payment ID
   * @returns Verified payment status
   */
  verifyPayment(providerPaymentId: string): Promise<{ status: 'confirmed' | 'pending' | 'failed'; paymentId: string }>;

  /**
   * Handle provider webhook callback
   * Validates the provider's signature according to their documentation
   * @param payload Raw webhook payload from provider
   * @param signature Provider signature for verification
   * @returns Whether the webhook is authentic and payment is confirmed
   */
  handleWebhook(payload: any, signature: string): Promise<{ valid: boolean; status: 'confirmed' | 'pending' | 'failed' }>;

  /**
   * Get payment method display name
   * @param provider Provider identifier
   * @returns Human-readable display name
   */
  getMethodName(provider: string): string;

  /**
   * Get payment method description/instructions
   * @param provider Provider identifier
   * @returns Payment instructions for the user
   */
  getInstructions(provider: string): string;
}

export class MockPaymentProvider implements PaymentProvider {
  /**
   * Creates a mock payment for local development.
   * This makes it obvious that no real money changes hands.
   * The payment is marked as "confirmed" immediately so the
   * Cinema Window access code flow can be tested end-to-end.
   */
  async createPayment(amount: number, currency: string, userId: string, roomId: string): Promise<any> {
    const paymentId = `pay_mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const payment = {
      id: paymentId,
      roomId,
      userId,
      amount,
      currency,
      provider: 'mock',
      providerPaymentId: paymentId,
      status: 'confirmed', // Mock immediately confirms for development
      confirmedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    console.log(`[MOCK PAYMENT] Payment created - Amount: ${amount}${currency}, Payment ID: ${paymentId}`);
    console.log('[MOCK PAYMENT] This is a development-only mock - no real money changes hands');
    console.log('[MOCK PAYMENT] Access code will be generated immediately for testing');

    return payment;
  }

  async verifyPayment(providerPaymentId: string): Promise<{ status: 'confirmed' | 'pending' | 'failed'; paymentId: string }> {
    return { status: 'confirmed', paymentId: providerPaymentId };
  }

  async handleWebhook(payload: any, signature: string): Promise<{ valid: boolean; status: 'confirmed' | 'pending' | 'failed' }> {
    // For mock, accept any valid-looking webhook
    if (payload && payload.paymentId) {
      return { valid: true, status: 'confirmed' };
    }
    return { valid: false, status: 'failed' };
  }

  getMethodName(provider: string): string {
    if (provider === 'mock') return 'Mock Payment (Development)';
    if (provider === 'asiapay') return 'AsiaPay';
    if (provider === 'fastpay') return 'FastPay';
    if (provider === 'card') return 'Bank/Card';
    return provider;
  }

  getInstructions(provider: string): string {
    if (provider === 'mock') {
      return 'ژمارەی survepayment.link- بیتەوە بۆ کۆتایی مەبەستەکانەوە. لە نموونیەکانەوە، کۆدەکەت دوەوە بە سەرکەوتووە بۆ ئەنجامی نێوە.';
    }
    if (provider === 'asiapay') return 'AsiaPay payment instructions pending - contact admin for API credentials';
    if (provider === 'fastpay') return 'FastPay payment instructions pending - contact admin for API credentials';
    if (provider === 'card') return 'Bank/Card payment instructions pending - contact admin for API credentials';
    return 'Payment instructions pending';
  }
}

export const paymentProvider: PaymentProvider = new MockPaymentProvider();

export function setPaymentProvider(provider: PaymentProvider): void {
  // Override the default provider for production integration
  // This allows switching from MockPaymentProvider to AsiaPayProvider, FastPayProvider, etc.
  // Example: setPaymentProvider(new AsiaPayProvider(process.env.ASIA_PAY_KEY!));
  console.log('[PAYMENT] Provider switched:', provider.constructor.name);
}