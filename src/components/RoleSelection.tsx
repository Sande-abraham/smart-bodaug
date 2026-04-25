import React from 'react';
import { UserRole } from '../types';
import { User, Bike, ShieldCheck, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface RoleSelectionProps {
  onSelect: (role: UserRole) => void;
}

export default function RoleSelection({ onSelect }: RoleSelectionProps) {
  const roles: { role: UserRole; title: string; description: string; icon: any }[] = [
    {
      role: 'customer',
      title: 'Customer',
      description: 'Find rides and track optimization',
      icon: User,
    },
    {
      role: 'rider',
      title: 'Boda Rider',
      description: 'Optimize routes, fuel and earn shifts',
      icon: Bike,
    },
    {
      role: 'admin',
      title: 'Administrator',
      description: 'Manage platform and monitor traffic',
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="w-full max-w-sm space-y-6 p-4">
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Choose Your Role</h2>
        <p className="text-gray-500 text-sm font-medium">Select how you will use BodaSmart</p>
      </header>

      <div className="space-y-3">
        {roles.map((item, i) => (
          <motion.button
            key={item.role}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => onSelect(item.role)}
            className="w-full flex items-center gap-3 p-4 bg-white border-2 border-transparent rounded-[24px] shadow-sm hover:shadow-lg hover:border-brand-yellow transition-all text-left group"
          >
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-brand-yellow transition-colors">
              <item.icon className="w-5 h-5 text-gray-400 group-hover:text-black" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 leading-tight">{item.title}</h3>
              <p className="text-xs text-gray-500 font-medium">{item.description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-yellow" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
