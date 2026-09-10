---
layout: post
title: Big Dub & Secret Dreams
---

Both festivals went waaay smoother for me this year than last year. Having the whole rig attached to the sousaphone so that it can be turned on by plugging in four cables and pushing two buttons is pretty great. Seeing some folks spinning flow toys during my SD set evoked the same emotions I felt the first time I saw a few kids dance around a tree while I was busking on acoustic sousaphone in Davis Square back in 2014. makes me feel like I'm on the right path.

I was hoping that I'd have a semblance of touring chops for SD but I got booked for an AV gig in Seattle immediately prior to it, and basically only buzzed on the mouthpiece a few times in the week leading up to the show. Props to the Seattle Public Library for having music practice rooms. I worked a 10-hour day Tuesday, flew back to Boston Wednesday, drove 12 hours to Ohio Thursday, crashed at my aunt's, then drove 2 hours to SD Friday, set up camp at quite possibly the furthest corner of GA car camping, found the phantasmagoria stage, requested a golf cart ride, loaded in all my gear early, covered it in a tarp backstage, wandered around for a while, decided to grab extra gear from camp just in case it was needed (none of it was needed), saw [Mr Bill](https://www.reddit.com/r/SecretDreams/comments/1wc4vzz/mmmisterrrrrr_billllllllllllllll/) perform, ate food, stifled anxiety-induced nausea, chilled in geovisual's dome, then around 1am I sat on a golf cart near the stage to warm up with mouthpiece buzzing. The moment I buzzed a gliss on the mouthpiece I knew it'd be a decent performance. To quote Gillespie: "Some days you get up and put the horn to your chops and it sounds pretty good and you win. Some days you try and nothing works and the horn wins. This goes on and on and then you die and the horn wins." And that day I won, which was pleasantly surprising. In 2014 for my senior recital I did everything I could to have it land on a "good day" and unfortunately it did not. A lot of luck is involved in that respect.

Playing a 75-minute solo sousaphone set is an insane thing to do, so a few weeks beforehand I [vibecoded a jack client](https://github.com/Sousastep/sousaFX-rpi-scripts/tree/main/playback) to playback wavs off the raspberry pi's SD card to allow for some breaks. I had 8 tracks picked out and only played four: Coki - All Of A Sudden, Zha - Floating, Cotti + Cluekid - The Legacy, and SPMC LXOne - Hunted. The playback ran through the same effects that the drum looper uses, which allows for stutters and dub delays. It worked as well as I could've hoped, and the few folks who stuck around during the code orange got a kick out of it, for sure. Soon after my set was over a code red was issued and I was worried that I'd get stuck backstage with my gear. Huge props to the stage manager and golf cart guy for getting me back to camp before the rainstorm hit. The whole phantasmagoria crew was top-notch.

At Big Dub, the wandering set was super fun. More fun than being on a stage, honestly, and a lot less anxiety-inducing. I'm still more of a novelty act than a gestalt, so just playing one or two songs for groups, explaining the rig, then moving on, worked well. I am hopeful that the novelty-ness will dissipate as I practice more and get closer to the skill ceiling, but it will take years. The saxophone was a novelty for 80 years before it was accepted as a legitimate instrument. Hopefully sousafx takes less time than that.

The rig's Max/RNBO code is architected well now. Implementing new features is fairly straightforward and robust. The same core is used for both the mobile raspberry pi rig, and the less portable laptop rig.

A fancy overdrive with oversampling is now the main distortion effect, but the simple `atan` waveshaper that it replaced actually may have sounded better, so I'm going to reimplement that and do some AB testing.

I also started implementing a fancy clipper with oversampling too but after ABing against the `clip` object it didn't sound any better, just different..

I do want to try adding phase distortion again. It works best on a sine wave input, and didn't sound very good on the tuba's sound, but I think if I use a sharp bell eq boost on the fundamental, that could approximate a sine wave, and could sound great thru the phase distortion.

The laptop rig is now set up to work well with the Eventide H9000, and with playback in Ableton Live, but clicking and dragging breakpoints and samples is just no fun and makes me sad. Improvising with the H9000 would be super fun though, so I'll definitely be experimenting with that more in the future.

SousaFX [v0.11.7](https://rnbo.sousastep.quest/v0.11.7/) will be released in a few weeks, after I veg out for a bit.


<div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;">

<iframe 
  width="315" 
  height="560" 
  src="https://www.youtube.com/embed/ODcT3P2wD44" 
  title="YouTube video player" 
  frameborder="0" 
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
  referrerpolicy="strict-origin-when-cross-origin" 
  allowfullscreen>
</iframe>

<iframe 
  width="315" 
  height="560" 
  src="https://www.youtube.com/embed/y-0XnNt5qKQ" 
  title="YouTube video player" 
  frameborder="0" 
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
  referrerpolicy="strict-origin-when-cross-origin" 
  allowfullscreen>
</iframe>

</div>

<img src="{{ '/images/kudo_seattle.webp' | relative_url }}" alt="interpretation technician gig in seattle" class="hero-image">

<img src="{{ '/images/sd_car_packed.webp' | relative_url }}" alt="car packed for drive to Ohio" class="hero-image">

<img src="{{ '/images/sd_camp_2026.webp' | relative_url }}" alt="car packed for drive to Ohio" class="hero-image">

<img src="{{ '/images/pg_stage_day.webp' | relative_url }}" alt="phantasmagoria stage daytime" class="hero-image">

<img src="{{ '/images/sd_pg_backstage.webp' | relative_url }}" alt="backstage before performance" class="hero-image">
