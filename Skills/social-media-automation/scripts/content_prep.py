#!/usr/bin/env python3
"""
Content Prep Workflow
Formats posts for LinkedIn, X, Facebook, and Instagram from a single source.
"""

import os
import sys
import json
import re
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime


class ContentFormatter:
    """Format content for different social platforms"""
    
    def __init__(self, source_file: str):
        self.source_file = Path(source_file)
        self.content = self._parse_source()
    
    def _parse_source(self) -> Dict:
        """Parse markdown source file with frontmatter"""
        if not self.source_file.exists():
            raise FileNotFoundError(f"Source file not found: {self.source_file}")
        
        with open(self.source_file, 'r') as f:
            full_content = f.read()
        
        # Extract frontmatter
        frontmatter_match = re.match(r'^---\n(.*?)\n---', full_content, re.DOTALL)
        if not frontmatter_match:
            raise ValueError("No frontmatter found in source file")
        
        # Parse YAML frontmatter
        try:
            import yaml
            metadata = yaml.safe_load(frontmatter_match.group(1))
        except ImportError:
            raise ImportError("PyYAML required: pip install pyyaml")
        
        body = full_content[frontmatter_match.end():]
        
        # Extract platform-specific sections
        platforms = {}
        current_platform = None
        current_content = []
        
        for line in body.split('\n'):
            # Match platform headers
            platform_match = re.match(r'^## (LinkedIn|X/Twitter|Facebook|Instagram)$', line)
            if platform_match:
                # Save previous platform content
                if current_platform and current_content:
                    platform_key = current_platform.lower().replace('/', '').replace('twitter', 'x')
                    platforms[platform_key] = '\n'.join(current_content).strip()
                # Start new platform
                current_platform = platform_match.group(1)
                current_content = []
            elif current_platform:
                current_content.append(line)
        
        # Save last platform
        if current_platform and current_content:
            platform_key = current_platform.lower().replace('/', '').replace('twitter', 'x')
            platforms[platform_key] = '\n'.join(current_content).strip()
        
        # Extract hashtags
        hashtags = self._extract_hashtags(body)
        
        return {
            'metadata': metadata,
            'platforms': platforms,
            'hashtags': hashtags,
            'body': body
        }
    
    def _extract_hashtags(self, text: str) -> List[str]:
        """Extract hashtags from text"""
        hashtags = re.findall(r'#(\w+)', text)
        return list(set(hashtags))
    
    def _format_linkedin(self, content: str) -> Dict:
        """Format for LinkedIn - minimal changes needed"""
        # LinkedIn likes line spacing
        # Convert markdown bold to LinkedIn format
        formatted = re.sub(r'\*\*(.*?)\*\*', r'\1', content)
        
        return {
            'platform': 'linkedin',
            'text': formatted,
            'max_length': 3000,
            'supports_images': True,
            'supports_emoji': True
        }
    
    def _format_x(self, content: str) -> Dict:
        """Format for X/Twitter - convert to thread if needed"""
        # If content is short, keep as single tweet
        if len(content) <= 280:
            return {
                'platform': 'x',
                'text': content,
                'max_length': 280,
                'supports_images': True,
                'supports_emoji': True
            }
        
        # Convert longer content to thread
        lines = content.split('\n')
        tweets = []
        current_tweet = []
        char_count = 0
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Start new tweet if adding would exceed limit
            if char_count + len(line) + 1 > 280:
                tweets.append('\n'.join(current_tweet))
                current_tweet = []
                char_count = 0
            
            current_tweet.append(line)
            char_count += len(line) + 1
        
        if current_tweet:
            tweets.append('\n'.join(current_tweet))
        
        return {
            'platform': 'x',
            'text': '\n\n---\n\n'.join(tweets),  # Separator for thread
            'tweets': tweets,
            'is_thread': True,
            'max_length': 280,
            'supports_images': True
        }
    
    def _format_facebook(self, content: str) -> Dict:
        """Format for Facebook - similar to LinkedIn but more casual"""
        # Facebook handles emoji well
        # Keep most formatting
        formatted = content
        
        return {
            'platform': 'facebook',
            'text': formatted,
            'max_length': 63206,
            'supports_images': True,
            'supports_emoji': True
        }
    
    def _format_instagram(self, content: str, hashtags: List[str]) -> Dict:
        """Format for Instagram - first paragraph + hashtags"""
        # Instagram captions: first paragraph is key
        # Hashtags at bottom
        lines = content.split('\n')
        
        # Get first substantial paragraph
        caption_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                break
            caption_lines.append(line)
        
        caption = '\n'.join(caption_lines[:5])  # First 5 lines max
        
        # Add hashtags at bottom
        if hashtags:
            # Instagram allows up to 30 hashtags
            relevant_tags = hashtags[:30]
            hashtag_block = '\n\n' + ' '.join([f'#{t}' for t in relevant_tags])
            caption += hashtag_block
        
        return {
            'platform': 'instagram',
            'text': caption,
            'max_length': 2200,
            'supports_images': True,
            'supports_emoji': True,
            'requires_image': True  # Instagram MUST have image
        }
    
    def format_for_platform(self, platform: str) -> Dict:
        """Format content for specific platform"""
        # Get content or use LinkedIn as source
        content = self.content['platforms'].get(platform)
        if not content:
            # Use LinkedIn content as source
            linkedin_content = self.content['platforms'].get('linkedin', '')
            if not linkedin_content:
                raise ValueError(f"No content found for {platform} or LinkedIn source")
            content = linkedin_content
        
        # Format based on platform
        formatters = {
            'linkedin': self._format_linkedin,
            'x': self._format_x,
            'facebook': self._format_facebook,
            'instagram': lambda c: self._format_instagram(c, self.content['hashtags'])
        }
        
        if platform not in formatters:
            raise ValueError(f"Unknown platform: {platform}")
        
        return formatters[platform](content)
    
    def format_all_platforms(self) -> Dict[str, Dict]:
        """Format content for all platforms"""
        platforms = ['linkedin', 'x', 'facebook', 'instagram']
        return {p: self.format_for_platform(p) for p in platforms}
    
    def save_formatted(self, output_dir: Optional[Path] = None) -> Dict[str, Path]:
        """Save formatted content to files"""
        if output_dir is None:
            output_dir = self.source_file.parent / 'formatted'
        
        output_dir.mkdir(exist_ok=True)
        
        # Use source filename base
        base_name = self.source_file.stem
        
        formatted_content = self.format_all_platforms()
        saved_files = {}
        
        for platform, content in formatted_content.items():
            output_file = output_dir / f"{base_name}_{platform}.txt"
            
            with open(output_file, 'w') as f:
                # Write metadata comment
                f.write(f"# Platform: {platform.upper()}\n")
                f.write(f"# Source: {self.source_file.name}\n")
                f.write(f"# Max length: {content['max_length']}\n")
                f.write(f"# Generated: {datetime.now().isoformat()}\n")
                f.write(f"# {'Requires image' if content.get('requires_image') else 'Text only'}\n\n")
                f.write("---\n\n")
                f.write(content['text'])
            
            saved_files[platform] = output_file
            print(f"✅ Saved {platform.upper()}: {output_file}")
        
        # Also save JSON summary
        summary_file = output_dir / f"{base_name}_summary.json"
        with open(summary_file, 'w') as f:
            json.dump(formatted_content, f, indent=2)
        
        return saved_files


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Format social media content for multiple platforms")
    parser.add_argument("source", help="Source markdown file")
    parser.add_argument("--platform", choices=["linkedin", "x", "facebook", "instagram", "all"], 
                       default="all", help="Platform(s) to format")
    parser.add_argument("--output", help="Output directory (default: ./formatted)")
    parser.add_argument("--preview", action="store_true", help="Preview formatted content without saving")
    
    args = parser.parse_args()
    
    try:
        formatter = ContentFormatter(args.source)
        
        if args.platform == "all":
            if args.preview:
                formatted = formatter.format_all_platforms()
                for platform, content in formatted.items():
                    print(f"\n{'='*60}")
                    print(f"Platform: {platform.upper()}")
                    print('='*60)
                    print(content['text'][:500] + "..." if len(content['text']) > 500 else content['text'])
            else:
                saved = formatter.save_formatted(Path(args.output) if args.output else None)
                print(f"\n✅ Saved {len(saved)} formatted posts")
        else:
            content = formatter.format_for_platform(args.platform)
            
            if args.preview:
                print(f"\n{'='*60}")
                print(f"Platform: {args.platform.upper()}")
                print('='*60)
                print(content['text'])
            else:
                output_dir = Path(args.output) if args.output else args.source.parent / 'formatted'
                output_dir.mkdir(exist_ok=True)
                
                base_name = args.source.stem
                output_file = output_dir / f"{base_name}_{args.platform}.txt"
                
                with open(output_file, 'w') as f:
                    f.write(content['text'])
                
                print(f"✅ Saved {args.platform.upper()}: {output_file}")
    
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
