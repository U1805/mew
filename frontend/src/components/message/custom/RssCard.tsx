import React from 'react';

const RssCard = ({ payload }) => {
  return (
    <div className="mt-2 p-3 rounded-lg border border-gray-600 bg-gray-800 max-w-sm">
      <a href={payload.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
        <h3 className="font-bold text-lg">{payload.title}</h3>
      </a>
      <p className="text-sm text-gray-400 mt-1 truncate">{payload.description}</p>
      {payload.image && <img src={payload.image} alt={payload.title} className="mt-2 rounded-lg max-h-40 w-full object-cover" />}
    </div>
  );
};

export default RssCard;
