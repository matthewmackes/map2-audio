# 🎵 Room Impulse Response (RIR) Collection - Quick Start

## What's This?
Free professional-quality reverb impulse responses from academic research datasets integrated into your Map2-Audio reverb plugin.

## 30-Second Setup

```bash
cd ~/map2-audio
bash install-rir-collection.sh
```

That's it! The script will download IRs from:
- **OpenAIR** (46+ spaces)
- **BUT Reverb** (1300+ recordings)
- **MIT IR Survey** (271 real locations)
- **REVERB Challenge** (professional studios)
- **Aachen Database** (concert halls)
- ...and more!

## Use in Map2-Audio

1. Go to: http://172.20.234.234:3000/chains/flow
2. Scroll to **✨ Reverb Impulse Response** (purple section)
3. Click dropdown under "Reverb Space"
4. Select any IR from the list
5. Adjust: Mix, Pre-delay, Stretch, EQ, Modulation...
6. Click **"+ Add Reverb IR to Chain"**

## What You Get

- **846+ Professional IRs** from academic institutions
- **Real-world recording locations** (churches, studios, outdoor spaces)
- **Multiple mic arrays** and configurations
- **Binaural recordings** for immersive reverb
- **Free and open-source** - no licensing fees

## Files Created

- `/home/mm/map2-audio/install-rir-collection.sh` - Simple installer
- `/home/mm/map2-audio/scripts/download-rir-collection.sh` - Full downloader
- `/home/mm/map2-audio/RIR-SETUP-GUIDE.md` - Complete documentation
- `~/.local/share/map2/ir/reverbs/` - IR files (created after install)

## Size & Performance

- **Download size**: ~5-10 GB (can be selective)
- **Storage**: ~5-10 GB on disk
- **Performance**: Minimal CPU overhead with ReevR engine
- **Load time**: Fast with preloading

## Advanced Usage

### Download Specific Dataset Only
```bash
cd /tmp
wget https://raw.githubusercontent.com/Graphi07/room-impulse-responses/master/get_openair.sh
chmod +x get_openair.sh
./get_openair.sh /tmp/openair
cp /tmp/openair/**/*.wav ~/.local/share/map2/ir/reverbs/
```

### Add Cabinet IRs (Bonus)
Place cabinet impulse response files in:
```
~/.local/share/map2/ir/cabinets/
```

Cabinet IR sources:
- [Celestion IR Library](https://celestion.com/)
- [Amplitube Cabinet IRs](https://www.ikmultimedia.com/)
- [Open-source cabinet IRs](https://www.axechange.com/)

### Monitor Installation
```bash
# Check download progress
tail -f ~/.local/share/map2/ir/reverbs/download-log.txt

# Count available IRs
find ~/.local/share/map2/ir/reverbs -name "*.wav" | wc -l

# Check disk usage
du -sh ~/.local/share/map2/ir/
```

## Troubleshooting

**IRs not showing?**
```bash
ls ~/.local/share/map2/ir/reverbs/ | head -20
```

**Download stuck?**
- Press Ctrl+C and run again
- Check internet connection
- Some datasets may require manual download

**Want to start fresh?**
```bash
rm -rf ~/.local/share/map2/ir/reverbs/*.wav
bash ~/map2-audio/install-rir-collection.sh
```

## Dataset Credits

All IRs from [Graphi07/room-impulse-responses](https://github.com/Graphi07/room-impulse-responses)

Individual datasets:
- OpenAIR by University of York
- BUT by Brno University of Technology
- MIT by MIT Media Lab
- REVERB by Microsoft Research
- Aachen by RWTH Aachen University
- ...and many more academic institutions

## Next Steps

1. **Explore**: Try different IRs with the same chain
2. **Compare**: A/B test short vs. long reverbs
3. **Customize**: Use Stretch/Trim to modify IRs
4. **Save**: Create presets for your favorite combinations
5. **Performance**: Monitor CPU with matrix view

---

**Questions?** See `/home/mm/map2-audio/RIR-SETUP-GUIDE.md` for detailed documentation.
