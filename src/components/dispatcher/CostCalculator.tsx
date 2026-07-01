import React from 'react';

interface OrderData {
  pickupAddress: string;
  destinationAddress: string;
  vehicleCategory: string;
  taxiCount: number;
}

interface CostCalculatorProps {
  orderData: OrderData;
}

const CostCalculator: React.FC<CostCalculatorProps> = ({ orderData }) => {
  return (
    <div className="flex-1 bg-[#f6f6f6] dark:bg-[#2d2d2d] rounded-lg p-4 border border-gray-300 dark:border-[#696969]" />
  );
};

export default CostCalculator;
