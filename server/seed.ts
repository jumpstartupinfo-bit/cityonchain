import { pool } from './db';

const CITIES = [
  // Asia
  { name: 'Tokyo', country: 'Japan', continent: 'Asia', lat: 35.6762, lng: 139.6503, population: 37435191, tier: 'mega' },
  { name: 'Delhi', country: 'India', continent: 'Asia', lat: 28.6139, lng: 77.2090, population: 32941000, tier: 'mega' },
  { name: 'Shanghai', country: 'China', continent: 'Asia', lat: 31.2304, lng: 121.4737, population: 28516904, tier: 'mega' },
  { name: 'Dhaka', country: 'Bangladesh', continent: 'Asia', lat: 23.8103, lng: 90.4125, population: 22478116, tier: 'mega' },
  { name: 'Mumbai', country: 'India', continent: 'Asia', lat: 19.0760, lng: 72.8777, population: 20667656, tier: 'mega' },
  { name: 'Beijing', country: 'China', continent: 'Asia', lat: 39.9042, lng: 116.4074, population: 20035455, tier: 'mega' },
  { name: 'Osaka', country: 'Japan', continent: 'Asia', lat: 34.6937, lng: 135.5023, population: 19110616, tier: 'large' },
  { name: 'Karachi', country: 'Pakistan', continent: 'Asia', lat: 24.8607, lng: 67.0011, population: 16093786, tier: 'large' },
  { name: 'Chongqing', country: 'China', continent: 'Asia', lat: 29.5630, lng: 106.5516, population: 15744263, tier: 'large' },
  { name: 'Istanbul', country: 'Turkey', continent: 'Asia', lat: 41.0082, lng: 28.9784, population: 15190336, tier: 'large' },
  { name: 'Kolkata', country: 'India', continent: 'Asia', lat: 22.5726, lng: 88.3639, population: 14974073, tier: 'large' },
  { name: 'Manila', country: 'Philippines', continent: 'Asia', lat: 14.5995, lng: 120.9842, population: 14158573, tier: 'large' },
  { name: 'Guangzhou', country: 'China', continent: 'Asia', lat: 23.1291, lng: 113.2644, population: 13964637, tier: 'large' },
  { name: 'Tianjin', country: 'China', continent: 'Asia', lat: 39.3434, lng: 117.3616, population: 13215344, tier: 'large' },
  { name: 'Shenzhen', country: 'China', continent: 'Asia', lat: 22.5431, lng: 114.0579, population: 12356820, tier: 'large' },
  { name: 'Lahore', country: 'Pakistan', continent: 'Asia', lat: 31.5204, lng: 74.3587, population: 12188978, tier: 'large' },
  { name: 'Bangalore', country: 'India', continent: 'Asia', lat: 12.9716, lng: 77.5946, population: 12326532, tier: 'large' },
  { name: 'Ho Chi Minh City', country: 'Vietnam', continent: 'Asia', lat: 10.7769, lng: 106.7009, population: 9077158, tier: 'large' },
  { name: 'Chennai', country: 'India', continent: 'Asia', lat: 13.0827, lng: 80.2707, population: 10456000, tier: 'large' },
  { name: 'Taipei', country: 'Taiwan', continent: 'Asia', lat: 25.0330, lng: 121.5654, population: 2670000, tier: 'standard' },
  { name: 'Seoul', country: 'South Korea', continent: 'Asia', lat: 37.5665, lng: 126.9780, population: 9776000, tier: 'large' },
  { name: 'Bangkok', country: 'Thailand', continent: 'Asia', lat: 13.7563, lng: 100.5018, population: 10539000, tier: 'large' },
  { name: 'Singapore', country: 'Singapore', continent: 'Asia', lat: 1.3521, lng: 103.8198, population: 5924000, tier: 'large' },
  { name: 'Kuala Lumpur', country: 'Malaysia', continent: 'Asia', lat: 3.1390, lng: 101.6869, population: 1768000, tier: 'standard' },
  { name: 'Jakarta', country: 'Indonesia', continent: 'Asia', lat: -6.2088, lng: 106.8456, population: 10770487, tier: 'large' },
  { name: 'Hanoi', country: 'Vietnam', continent: 'Asia', lat: 21.0285, lng: 105.8542, population: 5253000, tier: 'standard' },
  { name: 'Yangon', country: 'Myanmar', continent: 'Asia', lat: 16.8661, lng: 96.1951, population: 5211000, tier: 'standard' },
  { name: 'Colombo', country: 'Sri Lanka', continent: 'Asia', lat: 6.9271, lng: 79.8612, population: 752000, tier: 'small' },
  { name: 'Kathmandu', country: 'Nepal', continent: 'Asia', lat: 27.7172, lng: 85.3240, population: 1442271, tier: 'small' },
  { name: 'Islamabad', country: 'Pakistan', continent: 'Asia', lat: 33.7294, lng: 73.0931, population: 1014825, tier: 'small' },
  { name: 'Riyadh', country: 'Saudi Arabia', continent: 'Asia', lat: 24.7136, lng: 46.6753, population: 7676654, tier: 'large' },
  { name: 'Dubai', country: 'UAE', continent: 'Asia', lat: 25.2048, lng: 55.2708, population: 3478300, tier: 'large' },
  { name: 'Abu Dhabi', country: 'UAE', continent: 'Asia', lat: 24.4539, lng: 54.3773, population: 1480000, tier: 'standard' },
  { name: 'Doha', country: 'Qatar', continent: 'Asia', lat: 25.2854, lng: 51.5310, population: 956457, tier: 'small' },
  { name: 'Kuwait City', country: 'Kuwait', continent: 'Asia', lat: 29.3759, lng: 47.9774, population: 3115000, tier: 'standard' },
  { name: 'Muscat', country: 'Oman', continent: 'Asia', lat: 23.5880, lng: 58.3829, population: 797000, tier: 'small' },
  { name: 'Beirut', country: 'Lebanon', continent: 'Asia', lat: 33.8938, lng: 35.5018, population: 2385000, tier: 'standard' },
  { name: 'Amman', country: 'Jordan', continent: 'Asia', lat: 31.9539, lng: 35.9106, population: 4007526, tier: 'standard' },
  { name: 'Baghdad', country: 'Iraq', continent: 'Asia', lat: 33.3152, lng: 44.3661, population: 7323897, tier: 'large' },
  { name: 'Tehran', country: 'Iran', continent: 'Asia', lat: 35.6892, lng: 51.3890, population: 9135000, tier: 'large' },
  { name: 'Kabul', country: 'Afghanistan', continent: 'Asia', lat: 34.5253, lng: 69.1783, population: 4601789, tier: 'standard' },
  { name: 'Tashkent', country: 'Uzbekistan', continent: 'Asia', lat: 41.2995, lng: 69.2401, population: 2571668, tier: 'standard' },
  { name: 'Almaty', country: 'Kazakhstan', continent: 'Asia', lat: 43.2220, lng: 76.8512, population: 1854733, tier: 'standard' },
  { name: 'Ulaanbaatar', country: 'Mongolia', continent: 'Asia', lat: 47.8864, lng: 106.9057, population: 1466000, tier: 'small' },
  { name: 'Pyongyang', country: 'North Korea', continent: 'Asia', lat: 39.0392, lng: 125.7625, population: 3255388, tier: 'standard' },
  { name: 'Phnom Penh', country: 'Cambodia', continent: 'Asia', lat: 11.5564, lng: 104.9282, population: 2129371, tier: 'standard' },
  { name: 'Vientiane', country: 'Laos', continent: 'Asia', lat: 17.9757, lng: 102.6331, population: 820000, tier: 'small' },
  // Europe
  { name: 'Moscow', country: 'Russia', continent: 'Europe', lat: 55.7558, lng: 37.6173, population: 12506468, tier: 'mega' },
  { name: 'London', country: 'United Kingdom', continent: 'Europe', lat: 51.5074, lng: -0.1278, population: 9648110, tier: 'mega' },
  { name: 'Paris', country: 'France', continent: 'Europe', lat: 48.8566, lng: 2.3522, population: 11017230, tier: 'mega' },
  { name: 'Madrid', country: 'Spain', continent: 'Europe', lat: 40.4168, lng: -3.7038, population: 6713557, tier: 'large' },
  { name: 'Barcelona', country: 'Spain', continent: 'Europe', lat: 41.3851, lng: 2.1734, population: 5575000, tier: 'large' },
  { name: 'Berlin', country: 'Germany', continent: 'Europe', lat: 52.5200, lng: 13.4050, population: 3677472, tier: 'large' },
  { name: 'Rome', country: 'Italy', continent: 'Europe', lat: 41.9028, lng: 12.4964, population: 4297000, tier: 'large' },
  { name: 'Kyiv', country: 'Ukraine', continent: 'Europe', lat: 50.4501, lng: 30.5234, population: 2967360, tier: 'standard' },
  { name: 'Bucharest', country: 'Romania', continent: 'Europe', lat: 44.4268, lng: 26.1025, population: 1821000, tier: 'standard' },
  { name: 'Warsaw', country: 'Poland', continent: 'Europe', lat: 52.2297, lng: 21.0122, population: 1790658, tier: 'standard' },
  { name: 'Vienna', country: 'Austria', continent: 'Europe', lat: 48.2082, lng: 16.3738, population: 1911191, tier: 'standard' },
  { name: 'Amsterdam', country: 'Netherlands', continent: 'Europe', lat: 52.3676, lng: 4.9041, population: 873338, tier: 'small' },
  { name: 'Brussels', country: 'Belgium', continent: 'Europe', lat: 50.8503, lng: 4.3517, population: 1208542, tier: 'standard' },
  { name: 'Budapest', country: 'Hungary', continent: 'Europe', lat: 47.4979, lng: 19.0402, population: 1752704, tier: 'standard' },
  { name: 'Prague', country: 'Czech Republic', continent: 'Europe', lat: 50.0755, lng: 14.4378, population: 1335084, tier: 'standard' },
  { name: 'Stockholm', country: 'Sweden', continent: 'Europe', lat: 59.3293, lng: 18.0686, population: 975551, tier: 'small' },
  { name: 'Copenhagen', country: 'Denmark', continent: 'Europe', lat: 55.6761, lng: 12.5683, population: 794128, tier: 'small' },
  { name: 'Oslo', country: 'Norway', continent: 'Europe', lat: 59.9139, lng: 10.7522, population: 1042377, tier: 'small' },
  { name: 'Helsinki', country: 'Finland', continent: 'Europe', lat: 60.1699, lng: 24.9384, population: 658457, tier: 'small' },
  { name: 'Lisbon', country: 'Portugal', continent: 'Europe', lat: 38.7223, lng: -9.1393, population: 2870300, tier: 'standard' },
  { name: 'Athens', country: 'Greece', continent: 'Europe', lat: 37.9838, lng: 23.7275, population: 3153000, tier: 'standard' },
  { name: 'Zurich', country: 'Switzerland', continent: 'Europe', lat: 47.3769, lng: 8.5417, population: 1422628, tier: 'standard' },
  { name: 'Dublin', country: 'Ireland', continent: 'Europe', lat: 53.3498, lng: -6.2603, population: 1173179, tier: 'standard' },
  { name: 'Milan', country: 'Italy', continent: 'Europe', lat: 45.4642, lng: 9.1900, population: 1396059, tier: 'standard' },
  { name: 'Munich', country: 'Germany', continent: 'Europe', lat: 48.1351, lng: 11.5820, population: 1487708, tier: 'standard' },
  { name: 'Hamburg', country: 'Germany', continent: 'Europe', lat: 53.5753, lng: 10.0153, population: 1841179, tier: 'standard' },
  { name: 'Sofia', country: 'Bulgaria', continent: 'Europe', lat: 42.6977, lng: 23.3219, population: 1241675, tier: 'standard' },
  { name: 'Belgrade', country: 'Serbia', continent: 'Europe', lat: 44.7866, lng: 20.4489, population: 1688667, tier: 'standard' },
  { name: 'Zagreb', country: 'Croatia', continent: 'Europe', lat: 45.8150, lng: 15.9819, population: 806341, tier: 'small' },
  { name: 'Tallinn', country: 'Estonia', continent: 'Europe', lat: 59.4370, lng: 24.7536, population: 437619, tier: 'small' },
  { name: 'Riga', country: 'Latvia', continent: 'Europe', lat: 56.9496, lng: 24.1052, population: 605802, tier: 'small' },
  { name: 'Vilnius', country: 'Lithuania', continent: 'Europe', lat: 54.6872, lng: 25.2797, population: 592459, tier: 'small' },
  // Africa
  { name: 'Lagos', country: 'Nigeria', continent: 'Africa', lat: 6.5244, lng: 3.3792, population: 15388000, tier: 'mega' },
  { name: 'Kinshasa', country: 'DR Congo', continent: 'Africa', lat: -4.3317, lng: 15.3322, population: 14970460, tier: 'mega' },
  { name: 'Cairo', country: 'Egypt', continent: 'Africa', lat: 30.0444, lng: 31.2357, population: 21323000, tier: 'mega' },
  { name: 'Johannesburg', country: 'South Africa', continent: 'Africa', lat: -26.2041, lng: 28.0473, population: 5782747, tier: 'large' },
  { name: 'Luanda', country: 'Angola', continent: 'Africa', lat: -8.8399, lng: 13.2894, population: 8329926, tier: 'large' },
  { name: 'Dar es Salaam', country: 'Tanzania', continent: 'Africa', lat: -6.7924, lng: 39.2083, population: 7404689, tier: 'large' },
  { name: 'Abidjan', country: "Côte d'Ivoire", continent: 'Africa', lat: 5.3544, lng: -4.0074, population: 5515000, tier: 'large' },
  { name: 'Kano', country: 'Nigeria', continent: 'Africa', lat: 12.0022, lng: 8.5919, population: 4103000, tier: 'standard' },
  { name: 'Addis Ababa', country: 'Ethiopia', continent: 'Africa', lat: 9.0054, lng: 38.7636, population: 4794000, tier: 'standard' },
  { name: 'Nairobi', country: 'Kenya', continent: 'Africa', lat: -1.2921, lng: 36.8219, population: 4922000, tier: 'standard' },
  { name: 'Accra', country: 'Ghana', continent: 'Africa', lat: 5.6037, lng: -0.1870, population: 2388000, tier: 'standard' },
  { name: 'Kampala', country: 'Uganda', continent: 'Africa', lat: 0.3476, lng: 32.5825, population: 3523000, tier: 'standard' },
  { name: 'Cape Town', country: 'South Africa', continent: 'Africa', lat: -33.9249, lng: 18.4241, population: 4618000, tier: 'standard' },
  { name: 'Casablanca', country: 'Morocco', continent: 'Africa', lat: 33.5731, lng: -7.5898, population: 3752000, tier: 'standard' },
  { name: 'Dakar', country: 'Senegal', continent: 'Africa', lat: 14.6928, lng: -17.4467, population: 3731000, tier: 'standard' },
  { name: 'Algiers', country: 'Algeria', continent: 'Africa', lat: 36.7372, lng: 3.0865, population: 2693000, tier: 'standard' },
  { name: 'Khartoum', country: 'Sudan', continent: 'Africa', lat: 15.5007, lng: 32.5599, population: 6160000, tier: 'large' },
  { name: 'Tunis', country: 'Tunisia', continent: 'Africa', lat: 36.8190, lng: 10.1658, population: 2466000, tier: 'standard' },
  { name: 'Tripoli', country: 'Libya', continent: 'Africa', lat: 32.8872, lng: 13.1913, population: 1293016, tier: 'standard' },
  { name: 'Maputo', country: 'Mozambique', continent: 'Africa', lat: -25.9653, lng: 32.5892, population: 1766184, tier: 'standard' },
  { name: 'Lusaka', country: 'Zambia', continent: 'Africa', lat: -15.4166, lng: 28.2833, population: 2731696, tier: 'standard' },
  { name: 'Harare', country: 'Zimbabwe', continent: 'Africa', lat: -17.8252, lng: 31.0335, population: 2123132, tier: 'standard' },
  // Americas
  { name: 'São Paulo', country: 'Brazil', continent: 'Americas', lat: -23.5505, lng: -46.6333, population: 22430000, tier: 'mega' },
  { name: 'Mexico City', country: 'Mexico', continent: 'Americas', lat: 19.4326, lng: -99.1332, population: 21672000, tier: 'mega' },
  { name: 'New York', country: 'USA', continent: 'Americas', lat: 40.7128, lng: -74.0060, population: 20140470, tier: 'mega' },
  { name: 'Buenos Aires', country: 'Argentina', continent: 'Americas', lat: -34.6037, lng: -58.3816, population: 15369919, tier: 'mega' },
  { name: 'Los Angeles', country: 'USA', continent: 'Americas', lat: 34.0522, lng: -118.2437, population: 13310447, tier: 'mega' },
  { name: 'Rio de Janeiro', country: 'Brazil', continent: 'Americas', lat: -22.9068, lng: -43.1729, population: 13458075, tier: 'mega' },
  { name: 'Bogotá', country: 'Colombia', continent: 'Americas', lat: 4.7110, lng: -74.0721, population: 10978360, tier: 'large' },
  { name: 'Lima', country: 'Peru', continent: 'Americas', lat: -12.0464, lng: -77.0428, population: 10719000, tier: 'large' },
  { name: 'Chicago', country: 'USA', continent: 'Americas', lat: 41.8781, lng: -87.6298, population: 9533040, tier: 'large' },
  { name: 'Santiago', country: 'Chile', continent: 'Americas', lat: -33.4489, lng: -70.6693, population: 6257516, tier: 'large' },
  { name: 'Toronto', country: 'Canada', continent: 'Americas', lat: 43.6532, lng: -79.3832, population: 6197000, tier: 'large' },
  { name: 'Houston', country: 'USA', continent: 'Americas', lat: 29.7604, lng: -95.3698, population: 7340937, tier: 'large' },
  { name: 'Dallas', country: 'USA', continent: 'Americas', lat: 32.7767, lng: -96.7970, population: 7539711, tier: 'large' },
  { name: 'Miami', country: 'USA', continent: 'Americas', lat: 25.7617, lng: -80.1918, population: 6166488, tier: 'large' },
  { name: 'Guadalajara', country: 'Mexico', continent: 'Americas', lat: 20.6597, lng: -103.3496, population: 5268642, tier: 'large' },
  { name: 'Caracas', country: 'Venezuela', continent: 'Americas', lat: 10.4806, lng: -66.9036, population: 2900000, tier: 'standard' },
  { name: 'Quito', country: 'Ecuador', continent: 'Americas', lat: -0.1807, lng: -78.4678, population: 2011388, tier: 'standard' },
  { name: 'La Paz', country: 'Bolivia', continent: 'Americas', lat: -16.4897, lng: -68.1193, population: 1814000, tier: 'standard' },
  { name: 'Asunción', country: 'Paraguay', continent: 'Americas', lat: -25.2867, lng: -57.6470, population: 2448000, tier: 'standard' },
  { name: 'Montevideo', country: 'Uruguay', continent: 'Americas', lat: -34.9011, lng: -56.1645, population: 1381000, tier: 'standard' },
  { name: 'San José', country: 'Costa Rica', continent: 'Americas', lat: 9.9281, lng: -84.0907, population: 1347000, tier: 'standard' },
  { name: 'Guatemala City', country: 'Guatemala', continent: 'Americas', lat: 14.6349, lng: -90.5069, population: 2934000, tier: 'standard' },
  { name: 'Havana', country: 'Cuba', continent: 'Americas', lat: 23.1136, lng: -82.3666, population: 2135000, tier: 'standard' },
  { name: 'San Francisco', country: 'USA', continent: 'Americas', lat: 37.7749, lng: -122.4194, population: 4749008, tier: 'large' },
  { name: 'Seattle', country: 'USA', continent: 'Americas', lat: 47.6062, lng: -122.3321, population: 4018762, tier: 'standard' },
  { name: 'Atlanta', country: 'USA', continent: 'Americas', lat: 33.7490, lng: -84.3880, population: 6189000, tier: 'large' },
  { name: 'Phoenix', country: 'USA', continent: 'Americas', lat: 33.4484, lng: -112.0740, population: 5002221, tier: 'standard' },
  { name: 'Boston', country: 'USA', continent: 'Americas', lat: 42.3601, lng: -71.0589, population: 4941632, tier: 'standard' },
  { name: 'Washington DC', country: 'USA', continent: 'Americas', lat: 38.9072, lng: -77.0369, population: 6385162, tier: 'large' },
  { name: 'Montreal', country: 'Canada', continent: 'Americas', lat: 45.5017, lng: -73.5673, population: 4246723, tier: 'standard' },
  { name: 'Vancouver', country: 'Canada', continent: 'Americas', lat: 49.2827, lng: -123.1207, population: 2642825, tier: 'standard' },
  // Oceania
  { name: 'Sydney', country: 'Australia', continent: 'Oceania', lat: -33.8688, lng: 151.2093, population: 5312000, tier: 'large' },
  { name: 'Melbourne', country: 'Australia', continent: 'Oceania', lat: -37.8136, lng: 144.9631, population: 5078193, tier: 'large' },
  { name: 'Brisbane', country: 'Australia', continent: 'Oceania', lat: -27.4698, lng: 153.0251, population: 2514184, tier: 'standard' },
  { name: 'Auckland', country: 'New Zealand', continent: 'Oceania', lat: -36.8485, lng: 174.7633, population: 1717500, tier: 'standard' },
  { name: 'Perth', country: 'Australia', continent: 'Oceania', lat: -31.9505, lng: 115.8605, population: 2085973, tier: 'standard' },
  { name: 'Adelaide', country: 'Australia', continent: 'Oceania', lat: -34.9285, lng: 138.6007, population: 1402393, tier: 'standard' },
  { name: 'Wellington', country: 'New Zealand', continent: 'Oceania', lat: -41.2866, lng: 174.7756, population: 215400, tier: 'small' },
  // More Asia
  { name: 'Baku', country: 'Azerbaijan', continent: 'Asia', lat: 40.4093, lng: 49.8671, population: 2374000, tier: 'standard' },
  { name: 'Tbilisi', country: 'Georgia', continent: 'Asia', lat: 41.6938, lng: 44.8015, population: 1118000, tier: 'small' },
  { name: 'Yerevan', country: 'Armenia', continent: 'Asia', lat: 40.1811, lng: 44.5136, population: 1086000, tier: 'small' },
  { name: 'Bishkek', country: 'Kyrgyzstan', continent: 'Asia', lat: 42.8746, lng: 74.5698, population: 1012500, tier: 'small' },
  { name: 'Ashgabat', country: 'Turkmenistan', continent: 'Asia', lat: 37.9601, lng: 58.3261, population: 810000, tier: 'small' },
  { name: 'Dushanbe', country: 'Tajikistan', continent: 'Asia', lat: 38.5598, lng: 68.7870, population: 863400, tier: 'small' },
  { name: 'Mandalay', country: 'Myanmar', continent: 'Asia', lat: 21.9588, lng: 96.0891, population: 1319210, tier: 'standard' },
  { name: 'Quezon City', country: 'Philippines', continent: 'Asia', lat: 14.6760, lng: 121.0437, population: 2936116, tier: 'standard' },
  { name: 'Cebu City', country: 'Philippines', continent: 'Asia', lat: 10.3157, lng: 123.8854, population: 922611, tier: 'small' },
  { name: 'Surabaya', country: 'Indonesia', continent: 'Asia', lat: -7.2575, lng: 112.7521, population: 2765487, tier: 'standard' },
  { name: 'Bandung', country: 'Indonesia', continent: 'Asia', lat: -6.9175, lng: 107.6191, population: 2575478, tier: 'standard' },
  { name: 'Medan', country: 'Indonesia', continent: 'Asia', lat: 3.5952, lng: 98.6722, population: 2435252, tier: 'standard' },
  { name: 'Semarang', country: 'Indonesia', continent: 'Asia', lat: -6.9932, lng: 110.4203, population: 1653524, tier: 'standard' },
  { name: 'Makassar', country: 'Indonesia', continent: 'Asia', lat: -5.1477, lng: 119.4327, population: 1423877, tier: 'standard' },
  { name: 'Chengdu', country: 'China', continent: 'Asia', lat: 30.5728, lng: 104.0668, population: 9022000, tier: 'large' },
  { name: 'Wuhan', country: 'China', continent: 'Asia', lat: 30.5928, lng: 114.3055, population: 8176000, tier: 'large' },
  { name: 'Nanjing', country: 'China', continent: 'Asia', lat: 32.0603, lng: 118.7969, population: 8507000, tier: 'large' },
  { name: 'Xi\'an', country: 'China', continent: 'Asia', lat: 34.3416, lng: 108.9398, population: 8705600, tier: 'large' },
  { name: 'Hangzhou', country: 'China', continent: 'Asia', lat: 30.2741, lng: 120.1551, population: 11936000, tier: 'large' },
  { name: 'Harbin', country: 'China', continent: 'Asia', lat: 45.8038, lng: 126.5340, population: 5878939, tier: 'large' },
  { name: 'Zhengzhou', country: 'China', continent: 'Asia', lat: 34.7472, lng: 113.6249, population: 6695400, tier: 'large' },
  { name: 'Shenyang', country: 'China', continent: 'Asia', lat: 41.8057, lng: 123.4315, population: 6921000, tier: 'large' },
  { name: 'Pune', country: 'India', continent: 'Asia', lat: 18.5204, lng: 73.8567, population: 6629000, tier: 'large' },
  { name: 'Hyderabad', country: 'India', continent: 'Asia', lat: 17.3850, lng: 78.4867, population: 10004000, tier: 'large' },
  { name: 'Ahmedabad', country: 'India', continent: 'Asia', lat: 23.0225, lng: 72.5714, population: 8450000, tier: 'large' },
  { name: 'Surat', country: 'India', continent: 'Asia', lat: 21.1702, lng: 72.8311, population: 7784000, tier: 'large' },
  { name: 'Jaipur', country: 'India', continent: 'Asia', lat: 26.9124, lng: 75.7873, population: 3948000, tier: 'standard' },
  { name: 'Lucknow', country: 'India', continent: 'Asia', lat: 26.8467, lng: 80.9462, population: 3781000, tier: 'standard' },
  // More Europe
  { name: 'Saint Petersburg', country: 'Russia', continent: 'Europe', lat: 59.9343, lng: 30.3351, population: 5601000, tier: 'large' },
  { name: 'Novosibirsk', country: 'Russia', continent: 'Europe', lat: 54.9900, lng: 82.9800, population: 1625000, tier: 'standard' },
  { name: 'Yekaterinburg', country: 'Russia', continent: 'Europe', lat: 56.8389, lng: 60.6057, population: 1544000, tier: 'standard' },
  { name: 'Minsk', country: 'Belarus', continent: 'Europe', lat: 53.9045, lng: 27.5615, population: 2009786, tier: 'standard' },
  { name: 'Kyiv', country: 'Ukraine', continent: 'Europe', lat: 50.4501, lng: 30.5234, population: 2967360, tier: 'standard' },
  { name: 'Kharkiv', country: 'Ukraine', continent: 'Europe', lat: 49.9935, lng: 36.2304, population: 1443000, tier: 'standard' },
  { name: 'Skopje', country: 'North Macedonia', continent: 'Europe', lat: 41.9981, lng: 21.4254, population: 544086, tier: 'small' },
  { name: 'Sarajevo', country: 'Bosnia', continent: 'Europe', lat: 43.8476, lng: 18.3564, population: 275524, tier: 'small' },
  { name: 'Tirana', country: 'Albania', continent: 'Europe', lat: 41.3275, lng: 19.8187, population: 800000, tier: 'small' },
  { name: 'Chisinau', country: 'Moldova', continent: 'Europe', lat: 47.0105, lng: 28.8638, population: 675000, tier: 'small' },
  // More Americas
  { name: 'Bogotá', country: 'Colombia', continent: 'Americas', lat: 4.7110, lng: -74.0721, population: 10978360, tier: 'large' },
  { name: 'Medellín', country: 'Colombia', continent: 'Americas', lat: 6.2442, lng: -75.5812, population: 2569000, tier: 'standard' },
  { name: 'Cali', country: 'Colombia', continent: 'Americas', lat: 3.4516, lng: -76.5320, population: 2228000, tier: 'standard' },
  { name: 'Recife', country: 'Brazil', continent: 'Americas', lat: -8.0476, lng: -34.8770, population: 4048000, tier: 'standard' },
  { name: 'Salvador', country: 'Brazil', continent: 'Americas', lat: -12.9777, lng: -38.5016, population: 4075000, tier: 'standard' },
  { name: 'Belo Horizonte', country: 'Brazil', continent: 'Americas', lat: -19.9167, lng: -43.9345, population: 6136000, tier: 'large' },
  { name: 'Manaus', country: 'Brazil', continent: 'Americas', lat: -3.1190, lng: -60.0217, population: 2255903, tier: 'standard' },
  { name: 'Curitiba', country: 'Brazil', continent: 'Americas', lat: -25.4290, lng: -49.2671, population: 3620892, tier: 'standard' },
  { name: 'Porto Alegre', country: 'Brazil', continent: 'Americas', lat: -30.0346, lng: -51.2177, population: 4295769, tier: 'standard' },
  { name: 'Fortaleza', country: 'Brazil', continent: 'Americas', lat: -3.7172, lng: -38.5433, population: 4043980, tier: 'standard' },
  { name: 'Monterrey', country: 'Mexico', continent: 'Americas', lat: 25.6866, lng: -100.3161, population: 4689601, tier: 'standard' },
  { name: 'Puebla', country: 'Mexico', continent: 'Americas', lat: 19.0414, lng: -98.2063, population: 3199519, tier: 'standard' },
  { name: 'Tijuana', country: 'Mexico', continent: 'Americas', lat: 32.5149, lng: -117.0382, population: 1922523, tier: 'standard' },
  { name: 'Denver', country: 'USA', continent: 'Americas', lat: 39.7392, lng: -104.9903, population: 2963821, tier: 'standard' },
  { name: 'Las Vegas', country: 'USA', continent: 'Americas', lat: 36.1699, lng: -115.1398, population: 2266715, tier: 'standard' },
  { name: 'Portland', country: 'USA', continent: 'Americas', lat: 45.5051, lng: -122.6750, population: 2512250, tier: 'standard' },
  { name: 'Detroit', country: 'USA', continent: 'Americas', lat: 42.3314, lng: -83.0458, population: 4390879, tier: 'standard' },
  { name: 'Minneapolis', country: 'USA', continent: 'Americas', lat: 44.9778, lng: -93.2650, population: 3647078, tier: 'standard' },
  { name: 'San Diego', country: 'USA', continent: 'Americas', lat: 32.7157, lng: -117.1611, population: 3317749, tier: 'standard' },
  { name: 'Philadelphia', country: 'USA', continent: 'Americas', lat: 39.9526, lng: -75.1652, population: 6245051, tier: 'large' },
  // More Africa
  { name: 'Kumasi', country: 'Ghana', continent: 'Africa', lat: 6.6885, lng: -1.6244, population: 3878429, tier: 'standard' },
  { name: 'Ibadan', country: 'Nigeria', continent: 'Africa', lat: 7.3775, lng: 3.9470, population: 3649000, tier: 'standard' },
  { name: 'Abuja', country: 'Nigeria', continent: 'Africa', lat: 9.0765, lng: 7.3986, population: 3278000, tier: 'standard' },
  { name: 'Durban', country: 'South Africa', continent: 'Africa', lat: -29.8587, lng: 31.0218, population: 3786000, tier: 'standard' },
  { name: 'Pretoria', country: 'South Africa', continent: 'Africa', lat: -25.7479, lng: 28.2293, population: 2921488, tier: 'standard' },
  { name: 'Mombasa', country: 'Kenya', continent: 'Africa', lat: -4.0435, lng: 39.6682, population: 1208333, tier: 'standard' },
  { name: 'Antananarivo', country: 'Madagascar', continent: 'Africa', lat: -18.9137, lng: 47.5361, population: 1391433, tier: 'standard' },
  { name: 'Douala', country: 'Cameroon', continent: 'Africa', lat: 4.0511, lng: 9.7679, population: 3412000, tier: 'standard' },
  { name: 'Yaoundé', country: 'Cameroon', continent: 'Africa', lat: 3.8480, lng: 11.5021, population: 2765000, tier: 'standard' },
  { name: 'Dakar', country: 'Senegal', continent: 'Africa', lat: 14.6928, lng: -17.4467, population: 3731000, tier: 'standard' },
  { name: 'Conakry', country: 'Guinea', continent: 'Africa', lat: 9.6412, lng: -13.5784, population: 1667864, tier: 'standard' },
  { name: 'Freetown', country: 'Sierra Leone', continent: 'Africa', lat: 8.4657, lng: -13.2317, population: 1055964, tier: 'small' },
  { name: 'Ouagadougou', country: 'Burkina Faso', continent: 'Africa', lat: 12.3569, lng: -1.5353, population: 2415266, tier: 'standard' },
  { name: 'Bamako', country: 'Mali', continent: 'Africa', lat: 12.6392, lng: -8.0029, population: 2471787, tier: 'standard' },
  { name: 'Lomé', country: 'Togo', continent: 'Africa', lat: 6.1375, lng: 1.2123, population: 887380, tier: 'small' },
  { name: 'Cotonou', country: 'Benin', continent: 'Africa', lat: 6.3654, lng: 2.4183, population: 762000, tier: 'small' },
  { name: 'Niamey', country: 'Niger', continent: 'Africa', lat: 13.5137, lng: 2.1098, population: 1011277, tier: 'small' },
];

function toSlug(name: string, country: string): string {
  return `${name}-${country}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function mayorPrice(tier: string): number {
  const prices: Record<string, number> = { mega: 5000, large: 2000, standard: 500, small: 200 };
  return prices[tier] ?? 500;
}

function districtPrice(tier: string): number {
  const prices: Record<string, number> = { mega: 500, large: 200, standard: 50, small: 20 };
  return prices[tier] ?? 50;
}

function districtCount(tier: string): number {
  const counts: Record<string, number> = { mega: 16, large: 9, standard: 6, small: 4 };
  return counts[tier] ?? 6;
}

const DISTRICT_NAMES = ['Downtown', 'Northside', 'Eastside', 'Southside', 'Westside', 'Harbor', 'Uptown', 'Industrial', 'Arts Quarter', 'Financial District', 'University', 'Airport', 'Suburbs', 'Old Town', 'Beachfront', 'Tech Hub'];

export async function seed() {
  const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM cities');
  if (parseInt(count) > 0) { console.log('[seed] cities already seeded, skipping'); return; }

  console.log(`[seed] seeding ${CITIES.length} cities…`);

  // Deduplicate by slug
  const seen = new Set<string>();
  const unique = CITIES.filter(c => {
    const s = toSlug(c.name, c.country);
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });

  for (const city of unique) {
    const slug = toSlug(city.name, city.country);
    const mp = mayorPrice(city.tier);
    const dp = districtPrice(city.tier);
    const dc = districtCount(city.tier);

    const { rows: [row] } = await pool.query(
      `INSERT INTO cities (name, country, continent, lat, lng, population, tier, mayor_price, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [city.name, city.country, city.continent, city.lat, city.lng, city.population, city.tier, mp, slug]
    );
    if (!row) continue;

    const cityId = row.id;
    for (let i = 0; i < dc; i++) {
      await pool.query(
        `INSERT INTO districts (city_id, name, index, price) VALUES ($1,$2,$3,$4) ON CONFLICT (city_id, index) DO NOTHING`,
        [cityId, DISTRICT_NAMES[i] ?? `District ${i + 1}`, i, dp]
      );
    }
  }
  console.log(`[seed] done — seeded ${unique.length} cities`);
}
